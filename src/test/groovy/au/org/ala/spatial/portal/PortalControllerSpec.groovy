package au.org.ala.spatial.portal

import au.org.ala.ws.service.WebService
import grails.testing.web.controllers.ControllerUnitTest
import spock.lang.Specification
import spock.lang.Unroll

class PortalControllerSpec extends Specification implements ControllerUnitTest<PortalController> {

    // au.org.ala.web.AuthService cannot be mocked here, its UserDetails type is not on the test classpath
    Expando authService = new Expando(userId: null, userInRole: { role -> false }, loginUrl: { req -> '/login' })
    SessionService sessionService = Mock(SessionService)
    PortalService portalService = Mock(PortalService)
    MessageService messageService = Mock(MessageService)
    WebService webService = Mock()

    @Override
    Set<String> getIncludePlugins() {
        ['core', 'eventBus', 'converters'].toSet()
    }

    @Override
    Closure doWithConfig() {
        { config ->
            config.security.oidc.enabled = true
            config.layersService.url = 'https://spatial.example.org/ws'
            config.cache.headers.control = 'max-age=3600'
        }
    }

    def setup() {
        controller.authService = authService
        controller.sessionService = sessionService
        controller.portalService = portalService
    }

    void loggedIn(String userId) {
        authService.userId = userId
    }

    void "ping answers an empty JSON object"() {
        when:
        request.method = 'POST'
        controller.ping()

        then:
        response.status == 200
        response.text == '{}'
    }

    @Unroll
    void "#method session requires login"() {
        given:
        request.method = method

        when:
        controller.session(1L)

        then:
        response.status == 403
        response.json.error == 'Login required!'
        0 * sessionService._

        where:
        method << ['GET', 'POST', 'DELETE']
    }

    void "a logged in user can save a session"() {
        given:
        loggedIn('u1')
        request.method = 'POST'
        request.json = '{"name": "my session"}'

        when:
        controller.session(null)

        then:
        1 * sessionService.newId('u1') >> 42L
        1 * sessionService.put(42L, 'u1', { it.name == 'my session' }, true) >> [status: 'saved', url: 'https://hub?ss=42']
        response.json.url == 'https://hub?ss=42'
    }

    void "a logged in user can read a session"() {
        given:
        loggedIn('u1')
        request.method = 'GET'

        when:
        controller.session(42L)

        then:
        1 * sessionService.get(42L) >> [name: 'my session']
        response.json.name == 'my session'
    }

    void "a logged in user can remove a session from their list"() {
        given:
        loggedIn('u1')
        request.method = 'DELETE'

        when:
        controller.session(42L)

        then:
        1 * sessionService.updateUserSave(42L, 'u1', SessionService.DELETE, null, null) >> []
        response.status == 200
    }

    void "a session can be cached without login and is not persisted"() {
        given:
        request.method = 'POST'
        request.json = '{"layers": []}'

        when:
        controller.sessionCache(null)

        then:
        1 * sessionService.newId(null) >> 7L
        1 * sessionService.put(7L, null, _, false) >> [status: 'saved', url: 'https://hub?ss=7']
        response.json.status == 'saved'
    }

    void "postTask requires login"() {
        given:
        request.method = 'POST'

        when:
        controller.postTask()

        then:
        response.status == 401
        response.json.error == 'not permitted'
    }

    void "postAreaWkt requires login"() {
        given:
        request.method = 'POST'

        when:
        controller.postAreaWkt()

        then:
        response.status == 401
        response.json.error == 'not permitted'
    }

    @Unroll
    void "config '#id' returns the #type config"() {
        given:
        loggedIn('u1')

        when:
        controller.config(id)

        then:
        1 * portalService.getConfig(type, false, null) >> [type: type]
        response.json.type == type
        response.getHeader('Cache-Control') == 'max-age=3600'

        where:
        id        | type
        'view'    | 'view'
        'menu'    | 'menu'
        'unknown' | 'view'
    }

    void "config can be returned as indented text"() {
        given:
        loggedIn('u1')
        params.text = 'true'

        when:
        controller.config('menu')

        then:
        1 * portalService.getConfig('menu', false, null) >> [a: 1]
        response.contentType.startsWith('text/plain')
        response.text == '{"a": 1}' // pretty printed
    }

    void "config is not available to anonymous users when the hub requires a role"() {
        when:
        controller.config('view')

        then:
        1 * portalService.getAppConfig(null) >> [user_roles: ['ROLE_USER']]
        response.status == 401
        0 * portalService.getConfig(*_)
    }

    void "messages redirects for browser caching and renders nothing else"() {
        given:
        loggedIn('u1')
        controller.messageService = messageService

        when:
        controller.messages()

        then:
        1 * messageService.getMessagesAge() >> 7
        0 * messageService.getMessages()
        response.redirectedUrl == '/portal/messages/7'
        response.text == ''
    }

    void "postTask answers an empty JSON object when the service answers nothing"() {
        given:
        loggedIn('u1')
        controller.webService = webService
        request.method = 'POST'
        request.json = '{"name": "AooEoo"}'

        when:
        controller.postTask()

        then:
        1 * webService.post(*_) >> null
        response.text == '{}'
    }

    void "speciesListItems keeps the error of the lists service in the body"() {
        given:
        loggedIn('u1')
        controller.webService = webService
        params.id = 'dr1'

        when:
        controller.speciesListItems()

        then:
        1 * webService.get(*_) >> [statusCode: 404, resp: 'no such list']
        response.status == 404
        response.json.error == 'no such list'
    }
}
