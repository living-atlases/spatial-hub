package au.org.ala.spatial.portal

import au.org.ala.ws.service.WebService
import grails.converters.JSON
import grails.testing.web.controllers.ControllerUnitTest
import org.apache.http.entity.ContentType
import org.springframework.cache.support.SimpleValueWrapper
import spock.lang.PendingFeature
import spock.lang.Specification

/**
 * /portal/q registers a biocache query (q, fq, wkt, qc) and returns its qid.
 */
class PortalControllerQSpec extends Specification implements ControllerUnitTest<PortalController> {

    WebService webService = Mock()
    Map cache = [:]

    def setup() {
        controller.webService = webService
        controller.portalService = [caches: [QID: 'qid']]
        controller.grailsCacheManager = [getCache: { String name -> new MapCache(cache) }]
        request.method = 'POST'
    }

    def "a query is posted to biocache and its qid is returned"() {
        given:
        request.json = [q: 'taxa:Macropus', fq: ['state:Victoria', null], bs: 'https://biocache.example/ws']

        when:
        controller.q()

        then:
        1 * webService.post('https://biocache.example/ws/webportal/params', { String body ->
            body.contains('q=taxa%3AMacropus') && body.contains('fq=state%3AVictoria') && !body.contains('null')
        }, null, ContentType.APPLICATION_FORM_URLENCODED, false, false) >> [statusCode: 200, resp: ['1234': null]]
        response.json.qid == '1234'
    }

    def "an error from biocache is returned as a 500"() {
        given:
        request.json = [q: 'taxa:Macropus', bs: 'https://biocache.example/ws']

        when:
        controller.q()

        then:
        1 * webService.post(*_) >> [statusCode: 503, text: 'down'.bytes]
        response.status == 500
        response.json.error
    }

    def "the same query is answered from the cache"() {
        given:
        request.json = [q: 'taxa:Macropus', bs: 'https://biocache.example/ws']
        cache[JSON.parse('{"q": "taxa:Macropus", "bs": "https://biocache.example/ws"}')] = '{"qid":"99"}'

        when:
        controller.q()

        then:
        0 * webService._
        response.json.qid == '99'
    }

    def "a qid query with filters moves the qid to the first fq"() {
        given:
        request.json = [q: 'qid:55', fq: ['year:2000'], bs: 'https://biocache.example/ws']

        when:
        controller.q()

        then:
        1 * webService.post(_, { String body -> body.contains('q=year%3A2000') && body.contains('fq=qid%3A55') }, *_) >>
                [statusCode: 200, resp: ['56': null]]
        response.json.qid == '56'
    }

    /**
     * A bare "qid:55" renders {"qid": "55"} but does not return, so the query is posted to biocache
     * anyway and a second response is written to the same request.
     */
    @PendingFeature(reason = 'PortalController.q does not return after rendering the qid of a bare qid query')
    def "a bare qid query returns the qid without calling biocache"() {
        given:
        request.json = [q: 'qid:55', bs: 'https://biocache.example/ws']

        when:
        controller.q()

        then:
        0 * webService._
        response.text == '{"qid":"55"}'
    }
}

/** Minimal stand-in for a Spring cache backed by a map. */
class MapCache {
    Map map

    MapCache(Map map) { this.map = map }

    def get(key) { map.containsKey(key) ? new SimpleValueWrapper(map[key]) : null }

    void put(key, value) { map[key] = value }
}
