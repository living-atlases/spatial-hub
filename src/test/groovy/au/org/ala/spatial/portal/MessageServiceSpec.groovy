package au.org.ala.spatial.portal

import grails.testing.services.ServiceUnitTest
import spock.lang.Specification

/**
 * Unit tests for MessageService's parsing of the biocache /facets/i18n response.
 */
class MessageServiceSpec extends Specification implements ServiceUnitTest<MessageService> {

    def hubWebService = Mock(HubWebService)

    def setup() {
        config.biocacheService = [url: 'http://biocache']
        service.hubWebService = hubWebService
    }

    def "updateMessages parses key=value lines and trims whitespace"() {
        when:
        service.updateMessages()

        then:
        1 * hubWebService.getUrl('http://biocache/facets/i18n', null, false) >> "  state = Victoria \nrank=species"
        service.@messages == [state: 'Victoria', rank: 'species']
    }

    def "updateMessages skips comment lines starting with #"() {
        when:
        service.updateMessages()

        then:
        1 * hubWebService.getUrl(_, _, _) >> "a=1\n#b=2\nc=3"
        service.@messages == [a: '1', c: '3']
        !service.@messages.containsKey('b')
    }

    def "updateMessages bumps messagesAge when the messages change"() {
        given:
        def before = service.@messagesAge

        when:
        Thread.sleep(2)
        service.updateMessages()

        then:
        1 * hubWebService.getUrl(_, _, _) >> "a=1"
        service.@messagesAge > before
    }

    def "updateMessages leaves messages empty when the response is blank"() {
        when:
        service.updateMessages()

        then:
        1 * hubWebService.getUrl(_, _, _) >> ''
        service.@messages == [:]
    }

    def "getMessages fetches the messages when the cache is empty"() {
        when:
        service.getMessages()

        then:
        1 * hubWebService.getUrl(_, _, _) >> 'a=1'
        service.@messages == [a: '1']
    }
}
