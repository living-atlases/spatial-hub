package au.org.ala.spatial.portal

import grails.testing.services.ServiceUnitTest
import spock.lang.Specification

/**
 * Unit tests for PropertiesService.get, which loads bundled message bundles and falls back to the
 * English defaults for any key missing from the requested language.
 */
class PropertiesServiceSpec extends Specification implements ServiceUnitTest<PropertiesService> {

    static final String KEY = 'default.invalid.url.message'

    def "get('default') loads the bundled English messages"() {
        when:
        def props = service.get('default')

        then:
        props instanceof Properties
        props.size() > 0
        props.getProperty(KEY)?.contains('not a valid URL')
    }

    def "get for a translated language uses the translation"() {
        when:
        def props = service.get('fr')

        then:
        // the French bundle translates this key
        props.getProperty(KEY)?.contains('URL valide')
    }

    def "get falls back to the English default for keys missing from a language"() {
        given:
        def english = service.get('default')

        when:
        def fr = service.get('fr')

        then:
        // every English key is present (filled from defaults when not translated)
        english.stringPropertyNames().every { fr.getProperty(it) != null }
    }
}
