/** @format */

import { SpeechConfig, SpeechSynthesisOutputFormat } from 'microsoft-cognitiveservices-speech-sdk'
import { env } from '@config/env'

export const SPEECH_KEY: string = env.AZURE_SPEECH_KEY
export const SPEECH_REGION: string = env.AZURE_SPEECH_REGION

export const speechConfig: SpeechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION)
// Raw16Khz16BitMonoPcm - 16kHz-16bit-单声道 PCM
speechConfig.speechSynthesisOutputFormat = SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm
