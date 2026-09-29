/** @format */

import { readFileSync } from 'fs'
import {
    SpeechConfig,
    AudioConfig,
    SpeechRecognizer,
    ResultReason,
    CancellationDetails,
    CancellationReason,
    SpeechRecognitionResult
} from 'microsoft-cognitiveservices-speech-sdk'
import { SPEECH_KEY, SPEECH_REGION } from './config-azure'

// This example requires environment variables named "ENDPOINT" and "SPEECH_KEY"
const speechConfig: SpeechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
// 语言不对的话，翻译一定错误，不指名的话默认英文
speechConfig.speechRecognitionLanguage = 'zh-CN'

function fromFile(): void {
    const readFileSync1 = readFileSync('YourAudioFile.wav')
    const audioConfig: AudioConfig = AudioConfig.fromWavFileInput(readFileSync1)
    const speechRecognizer: SpeechRecognizer = new SpeechRecognizer(speechConfig, audioConfig)

    speechRecognizer.recognizeOnceAsync((result: SpeechRecognitionResult) => {
        switch (result.reason) {
            case ResultReason.RecognizedSpeech:
                console.log(`RECOGNIZED: Text=${result.text}`)
                break
            case ResultReason.NoMatch:
                console.log('NOMATCH: Speech could not be recognized.', result)
                break
            case ResultReason.Canceled: {
                const cancellation: CancellationDetails = CancellationDetails.fromResult(result)
                console.log(`CANCELED: Reason=${cancellation.reason}`)

                if (cancellation.reason === CancellationReason.Error) {
                    console.log(`CANCELED: ErrorCode=${cancellation.ErrorCode}`)
                    console.log(`CANCELED: ErrorDetails=${cancellation.errorDetails}`)
                    console.log('CANCELED: Did you set the speech resource key and region values?')
                }
                break
            }
        }
        speechRecognizer.close()
    })
}

fromFile()
