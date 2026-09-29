/** @format */
import { path as ROOT } from 'app-root-path'
import path from 'path'

const EN = path.resolve(`${ROOT}/assets/locales/en.json`)
const CN = path.resolve(`${ROOT}/assets/locales/cn.json`)

export const i18nConfig = {
    fallbackLocale: 'en',
    messages: {
        en: require(EN),
        zh: require(CN)
    },
    requestKey: 'locale',
    cookieKey: 'locale',
    queryKey: 'lang',
    headerKey: 'accept-language'
}
