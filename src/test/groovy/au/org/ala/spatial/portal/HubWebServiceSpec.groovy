package au.org.ala.spatial.portal

import grails.testing.services.ServiceUnitTest
import spock.lang.Specification

/**
 * Unit tests for HubWebService.closeStream, the one helper that does not perform I/O. The rest of
 * HubWebService wraps Apache HttpClient calls and is exercised by the integration/functional tests.
 */
class HubWebServiceSpec extends Specification implements ServiceUnitTest<HubWebService> {

    def "closeStream tolerates a null stream object"() {
        when:
        service.closeStream(null)

        then:
        noExceptionThrown()
    }

    def "closeStream tolerates a stream object without a call or client"() {
        when:
        service.closeStream([:])

        then:
        noExceptionThrown()
    }

    def "closeStream releases the connection of the call"() {
        given:
        def released = false
        def streamObj = [call: [releaseConnection: { released = true }], client: null]

        when:
        service.closeStream(streamObj)

        then:
        released
    }

    def "closeStream does not shut down a client whose connection manager is not simple"() {
        given:
        def released = false
        def streamObj = [call: [releaseConnection: { released = true }],
                         client: [httpConnectionManager: new Object()]]

        when:
        service.closeStream(streamObj)

        then:
        released
        noExceptionThrown()
    }
}
