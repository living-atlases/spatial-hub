package au.org.ala.spatial.portal

import grails.testing.services.ServiceUnitTest
import spock.lang.Specification

/**
 * Unit tests for SessionService id generation and the in-memory (non-persisted) session store.
 */
class SessionServiceSpec extends Specification implements ServiceUnitTest<SessionService> {

    File dir

    def setup() {
        dir = File.createTempDir()
        config.sessions = [dir: dir.absolutePath]
        config.grails = [serverURL: 'http://hub']
    }

    def cleanup() {
        dir?.deleteDir()
    }

    def "newId returns strictly increasing ids"() {
        when:
        def a = service.newId('u1')
        def b = service.newId('u1')

        then:
        b > a
    }

    def "newId records the session and seeds an empty cache entry"() {
        when:
        def id = service.newId('u1')

        then:
        service.sessionCache.containsKey(id)
        service.sessionLog.find { it[0] == id && it[1] == 'newSession' && it[2] == 'u1' }
    }

    def "a non-persisted put stores the data in the cache and tmpSaves and returns the session url"() {
        given:
        def id = service.newId('u1')
        def data = [name: 'My session', layers: [1, 2]]

        when:
        def result = service.put(id, 'u1', data, false)

        then:
        result.status == 'saved'
        result.url == "http://hub?ss=${id}".toString()
        service.tmpSaves[id] == data
        service.get(id) == data
    }

    def "get returns an empty map for an unknown id with no saved file"() {
        expect:
        service.get(999999L) == [:]
    }

    def "list returns an empty list when the user has no saved sessions"() {
        expect:
        service.list('nobody') == []
    }
}
