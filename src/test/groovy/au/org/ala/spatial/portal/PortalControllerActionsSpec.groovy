package au.org.ala.spatial.portal

import au.org.ala.ws.service.WebService
import grails.testing.web.controllers.ControllerUnitTest
import org.apache.http.entity.ContentType
import spock.lang.PendingFeature
import spock.lang.Specification

/**
 * Unit tests for PortalController actions other than q(), covering the parts that do not depend on
 * security/authentication internals. OIDC is disabled in each test so getValidUserId() yields the
 * default user id, and collaborators (webService, portalService, messageService, propertiesService,
 * authService) are mocked.
 */
class PortalControllerActionsSpec extends Specification implements ControllerUnitTest<PortalController> {

    WebService webService = Mock()

    def setup() {
        // Disable OIDC so getValidUserId() returns the default user id and actions are reachable.
        config.security = [oidc: [enabled: false]]
        config.layersService = [url: 'http://layers']
        config.lists = [url: 'http://lists', version: 1]
        config.character = [encoding: 'UTF-8']
        config.cache = [headers: [control: 'max-age=60']]

        controller.webService = webService
        controller.portalService = [DEFAULT_USER_ID: -1, caches: [QID: 'qid', PROXY: 'proxy']]
        controller.authService = [userId: 'user-1', userInRole: { role -> false }, userDetails: { [:] }]
    }

    // --- ping ------------------------------------------------------------------------------------

    def "ping returns 200 with an empty JSON object"() {
        given:
        request.method = 'POST'

        when:
        controller.ping()

        then:
        response.status == 200
        response.text == '{}'
        response.getHeader('content-type') == 'application/json'
    }

    // --- messages --------------------------------------------------------------------------------

    def "messages renders the BiocacheI18n javascript with the cached messages"() {
        given:
        controller.messageService = [messagesAge: 42L, messages: '{"a":"b"}']
        params.id = '42'

        when:
        controller.messages()

        then:
        response.contentType.contains('text/javascript')
        response.text.startsWith('BiocacheI18n = { messages: {"a":"b"}')
        response.text.contains('get: function(key, _default)')
    }

    /**
     * When the browser-cache id is missing the action issues a redirect to add it, but it does not
     * return, so it goes on to write the javascript body to the already-redirected response.
     */
    @PendingFeature(reason = 'messages() does not return after redirecting to add the cache id, so it also writes a body')
    def "messages only redirects (no body) when the cache id is missing"() {
        given:
        controller.messageService = [messagesAge: 42L, messages: '{"a":"b"}']

        when:
        controller.messages()

        then:
        response.redirectedUrl != null
        response.text == ''
    }

    // --- i18n ------------------------------------------------------------------------------------

    def "i18n GET renders the properties for the requested language"() {
        given:
        request.method = 'GET'
        params.lang = 'fr'
        def props = new Properties()
        props.setProperty('greeting', 'Bonjour')
        PropertiesService propertiesService = Mock()
        controller.propertiesService = propertiesService

        when:
        controller.i18n()

        then:
        1 * propertiesService.get('fr') >> props
        response.json.greeting == 'Bonjour'
    }

    def "i18n POST stores the new value and reports the old one"() {
        given:
        request.method = 'POST'
        params.lang = 'fr'
        request.json = [key: 'greeting', value: 'Salut']
        def props = new Properties()
        props.setProperty('greeting', 'Bonjour')
        PropertiesService propertiesService = Mock()
        controller.propertiesService = propertiesService

        when:
        controller.i18n()

        then:
        1 * propertiesService.get('fr') >> props
        1 * propertiesService.set('fr', 'greeting', 'Salut')
        response.json.message == 'value changed'
        response.json.oldValue == 'Bonjour'
        response.json.newValue == 'Salut'
        response.json.key == 'greeting'
    }

    // --- speciesListItems ------------------------------------------------------------------------

    def "speciesListItems fetches the list items with max=1000"() {
        given:
        params.id = '42'

        when:
        controller.speciesListItems()

        then:
        1 * webService.get('http://lists/ws/speciesListItems/42?max=1000', [:], _, false, true, [:]) >>
                [statusCode: 200, resp: [items: ['a', 'b']]]
        response.status == 200
        response.json.items == ['a', 'b']
    }

    /**
     * On a non-2xx response the action rebuilds r as [error: r.resp] and then renders r.resp - but
     * r.resp is now null, so the error payload is discarded and rendering null throws (ambiguous
     * render overload). The same pattern is in speciesList and speciesListInfo.
     */
    @PendingFeature(reason = 'speciesListItems overwrites r with [error:...] then renders the now-null r.resp on a non-2xx response')
    def "speciesListItems renders the error body for a non-2xx response"() {
        given:
        params.id = '42'

        when:
        controller.speciesListItems()

        then:
        1 * webService.get(*_) >> [statusCode: 404, resp: [error: 'not found']]
        response.status == 404
        response.json.error != null
    }

    // --- speciesList -----------------------------------------------------------------------------

    def "speciesList v1 builds the legacy query with user, offset and max"() {
        given:
        config.lists.version = 1
        params.max = '50'
        params.offset = '100'
        params.q = 'frog'

        when:
        controller.speciesList()

        then:
        1 * webService.get('http://lists/ws/speciesList',
                [user: -1, offset: 100, max: 50, q: 'frog', sort: '', order: 'asc'], _, false, true, [:]) >>
                [statusCode: 200, resp: [count: 1]]
        response.status == 200
    }

    def "speciesList v2 converts offset and max into a page number"() {
        given:
        config.lists.version = 2
        params.max = '20'
        params.offset = '60' // page = 60/20 + 1 = 4

        when:
        controller.speciesList()

        then:
        1 * webService.get('http://lists/v2/speciesList',
                [page: 4, pageSize: 20, q: '', sort: '', order: 'asc'], _, false, true, [:]) >>
                [statusCode: 200, resp: [:]]
        response.status == 200
    }

    def "speciesList defaults max to 100 and offset to 0"() {
        given:
        config.lists.version = 2

        when:
        controller.speciesList()

        then:
        1 * webService.get('http://lists/v2/speciesList',
                [page: 1, pageSize: 100, q: '', sort: '', order: 'asc'], _, false, true, [:]) >>
                [statusCode: 200, resp: [:]]
    }

    // --- speciesListInfo -------------------------------------------------------------------------

    def "speciesListInfo looks up a single list by id"() {
        given:
        params.listId = 'dr123'

        when:
        controller.speciesListInfo()

        then:
        1 * webService.get('http://lists/ws/speciesList/dr123', null, _, false, true, [:]) >>
                [statusCode: 200, resp: [listName: 'My list']]
        response.json.listName == 'My list'
    }

    // --- postAreaWkt / postArea / postTask -------------------------------------------------------

    def "postAreaWkt proxies the WKT upload to the layers service"() {
        given:
        request.method = 'POST'
        request.json = [wkt: 'POLYGON((0 0,1 0,1 1,0 0))']

        when:
        controller.postAreaWkt()

        then:
        1 * webService.proxyPostRequest(_, 'http://layers/shape/upload/wkt', _, ContentType.APPLICATION_JSON, false, true)
    }

    def "postArea posts a feature index request with the shape id and user"() {
        given:
        request.method = 'POST'
        request.json = [shpId: 77]

        when:
        controller.postArea()

        then:
        1 * webService.post('http://layers/shape/upload/shp/77/featureIndex',
                { Map body -> body.shpId == 77 && body.user_id == 'user-1' }, null, ContentType.APPLICATION_JSON, false, true) >>
                [statusCode: 201, resp: [id: 1]]
        response.status == 201
    }

    def "postArea is unauthorised without an authenticated user"() {
        given:
        request.method = 'POST'
        request.json = [shpId: 77]
        controller.authService = [userId: null]

        when:
        controller.postArea()

        then:
        0 * webService._
        response.status == 401
        response.json.error == 'not permitted'
    }

    def "postTask creates a task with the user and session id in the query"() {
        given:
        request.method = 'POST'
        request.json = [name: 'job']
        params.sessionId = 'sess9'

        when:
        controller.postTask()

        then:
        1 * webService.post('http://layers/tasks/create?userId=-1&sessionId=sess9',
                _, null, ContentType.APPLICATION_JSON, false, true) >> [statusCode: 200, resp: [taskId: 5]]
        response.status == 200
        response.json.taskId == 5
    }

    /**
     * `render [:] as JSON` (no parentheses) is parsed as a subscript on a non-existent `render`
     * property rather than a method call, so when webService returns null the null branch throws
     * MissingPropertyException instead of rendering {}. Same code at lines 300, 356, 861, 878.
     */
    @PendingFeature(reason = 'postTask null branch uses unparenthesised `render [:] as JSON`, parsed as a subscript, so it throws instead of rendering {}')
    def "postTask renders an empty object when the service returns null"() {
        given:
        request.method = 'POST'
        request.json = [name: 'job']

        when:
        controller.postTask()

        then:
        1 * webService.post(*_) >> null
        response.text == '{}'
    }

    // --- getSampleCSV ----------------------------------------------------------------------------

    def "getSampleCSV refuses a url that is not on the proxy allow-list"() {
        given:
        request.method = 'GET'
        params.url = 'http://evil.example/data.zip'
        controller.portalService = [DEFAULT_USER_ID: -1, canProxy: { String u -> false }]

        when:
        controller.getSampleCSV()

        then:
        response.status == 401
        response.json.error == 'not permitted'
    }

    // --- config ----------------------------------------------------------------------------------

    def "config renders the view config for the hub"() {
        given:
        request.method = 'GET'
        controller.portalService = [DEFAULT_USER_ID: -1,
                                    getConfig    : { type, showDefault, hub -> [type: type, showDefault: showDefault] },
                                    getAppConfig : { hub -> [:] }]

        when:
        controller.config('view')

        then:
        response.json.type == 'view'
        response.json.showDefault == false
    }

    def "config falls back to the view type for an unknown id"() {
        given:
        request.method = 'GET'
        controller.portalService = [DEFAULT_USER_ID: -1,
                                    getConfig    : { type, showDefault, hub -> [type: type] },
                                    getAppConfig : { hub -> [:] }]

        when:
        controller.config('rubbish')

        then:
        response.json.type == 'view'
    }

    def "config accepts the menu type"() {
        given:
        request.method = 'GET'
        controller.portalService = [DEFAULT_USER_ID: -1,
                                    getConfig    : { type, showDefault, hub -> [type: type] },
                                    getAppConfig : { hub -> [:] }]

        when:
        controller.config('menu')

        then:
        response.json.type == 'menu'
    }

    def "config writes text/plain when text=true"() {
        given:
        request.method = 'GET'
        params.text = 'true'
        controller.portalService = [DEFAULT_USER_ID: -1,
                                    getConfig    : { type, showDefault, hub -> [a: 1] },
                                    getAppConfig : { hub -> [:] }]

        when:
        controller.config('view')

        then:
        response.contentType.contains('text/plain')
        response.text.contains('"a"')
    }
}
