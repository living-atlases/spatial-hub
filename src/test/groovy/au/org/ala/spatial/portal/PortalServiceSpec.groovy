package au.org.ala.spatial.portal

import grails.testing.services.ServiceUnitTest
import grails.util.Holders
import spock.lang.Specification

/**
 * Unit tests for the non-security helpers of PortalService: rebuildParameters, getAppConfig, the
 * caches map, DEFAULT_USER_ID and getConfig's resource fallback.
 */
class PortalServiceSpec extends Specification implements ServiceUnitTest<PortalService> {

    def setup() {
        config.character = [encoding: 'UTF-8']
        config.layersService = [url: 'http://layers']
        config.phylolink = [url: 'http://phylo']
        config.sampling = [url: 'http://sampling']
        config.allowProxy = [server: 'data.example.org']
    }

    // --- rebuildParameters -----------------------------------------------------------------------

    def "rebuildParameters skips the url parameter and uses the first value, url-encoded"() {
        given:
        Map params = [url: ['http://x'] as String[], q: ['hello world'] as String[], fq: ['state:Vic'] as String[]]

        when:
        def out = service.rebuildParameters(params, true)

        then:
        !out.contains('url=')
        out.contains('q=hello+world')
        out.contains('fq=state%3AVic')
    }

    def "rebuildParameters joins with ampersands and omits the leading one when returnWithAmpersand is true"() {
        given:
        Map params = [a: ['1'] as String[], b: ['2'] as String[]]

        when:
        def out = service.rebuildParameters(params, true)

        then:
        out == 'a=1&b=2'
    }

    def "rebuildParameters prepends a leading ampersand when returnWithAmpersand is false"() {
        given:
        Map params = [a: ['1'] as String[]]

        when:
        def out = service.rebuildParameters(params, false)

        then:
        out == '&a=1'
    }

    def "rebuildParameters returns an empty string for only a url parameter"() {
        expect:
        service.rebuildParameters([url: ['http://x'] as String[]], true) == ''
    }

    // --- getAppConfig ----------------------------------------------------------------------------

    def "getAppConfig with no hub returns a copy of the application config"() {
        when:
        def cfg = service.getAppConfig(null)

        then:
        cfg instanceof Map
        cfg.layersService.url == 'http://layers'
    }

    // --- caches / constants ----------------------------------------------------------------------

    def "caches maps the cache role names to their cache ids"() {
        expect:
        service.caches == [QID: 'qid', PROXY: 'proxy', FLICKR_LICENCES: 'flickr']
    }

    def "DEFAULT_USER_ID is -1"() {
        expect:
        PortalService.DEFAULT_USER_ID == -1
    }

    // --- canProxy (allow behaviour only) ---------------------------------------------------------

    def "canProxy allows predefined service prefixes"() {
        expect:
        service.canProxy('http://layers/shape/upload')
        service.canProxy('http://phylo/tree')
        service.canProxy('http://sampling/sample')
    }

    def "canProxy allows a configured proxy host"() {
        expect:
        service.canProxy('http://data.example.org/file.zip')
    }

    def "canProxy rejects an unrelated host"() {
        expect:
        !service.canProxy('http://unrelated.invalid/data.zip')
    }

    // --- getConfig -------------------------------------------------------------------------------

    def "getConfig falls back to the bundled default resource when no file is configured"() {
        when:
        def cfg = service.getConfig('view', true, null)

        then:
        cfg.AooEoo != null
    }
}
