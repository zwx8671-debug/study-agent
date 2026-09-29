/** @format */
import * as dotenv from 'dotenv'
import * as path from 'path'
import { TTSAzureService } from '../src/libs/voice/azure/TTSAzureService'
import { convertPcmToWav2 } from '@utils/pcmToWav'
import { buildSsml } from '@utils/ssml'
import { AZURE_VOICE_TTS_DEFAULT_SPEAKER, AZURE_DEFAULT_LANGUAGE } from '../src/libs/voice/azure/config-azure'
import { VoiceAttr, XmlVoiceElementHandler } from '../src/libs/xml/handler/XmlVoiceElementHandler'
import { TTSServiceType } from '../src/libs/voice/TTSFactory'

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env.dev'), override: true })

async function testAzureTTS1() {
    const lang = AZURE_DEFAULT_LANGUAGE
    const voiceName = AZURE_VOICE_TTS_DEFAULT_SPEAKER
    const rate = '0%'
    const volume = '0%'
    const style = ''
    const ssml = buildSsml(
        'For information about the supported values for attributes of the element',
        lang,
        voiceName,
        rate,
        volume,
        style
    )
    const voiceAttr: VoiceAttr = XmlVoiceElementHandler.getDefaultVoiceAttr(TTSServiceType.Azure)
    const promise = await TTSAzureService.synthesizeSpeech(ssml, voiceAttr)
    convertPcmToWav2(Buffer.from(promise.audio, 'base64'), `${lang}-${voiceName}-${rate}-${volume}-${style}.wav`)
}
async function testAzureTTS2() {
    const lang = AZURE_DEFAULT_LANGUAGE
    const voiceName = AZURE_VOICE_TTS_DEFAULT_SPEAKER
    const rate = '-50%'
    const volume = '100%'
    const style = ''
    const ssml = buildSsml(
        'For information about the supported values for attributes of the element',
        lang,
        voiceName,
        rate,
        volume,
        style
    )
    const voiceAttr: VoiceAttr = XmlVoiceElementHandler.getDefaultVoiceAttr(TTSServiceType.Azure)
    const promise = await TTSAzureService.synthesizeSpeech(ssml, voiceAttr)
    convertPcmToWav2(Buffer.from(promise.audio, 'base64'), `${lang}-${voiceName}-${rate}-${volume}-${style}.wav`)
}

// testAzureTTS1().then(() => console.log('Azure TTS test completed'))
testAzureTTS2().then(() => console.log('Azure TTS test completed'))
