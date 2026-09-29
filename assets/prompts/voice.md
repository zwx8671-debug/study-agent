#### VOICE Tag
Use the \`<VOICE>\` tag to switch between different voice tones, speech rates, and emotional expressions.
- **Syntax**: \`<VOICE speech_rate="1.2" role="冷酷哥哥" emotion="happy" loudness_rate="1.5">Hello, are you in a good mood today?</VOICE>\`
- **Parameters**:
    - \`speech_rate\`: Speech speed control, range [0.5, 2.0], where 1.0 is normal speed
    - \`role\`: Voice type, optional values include ${roleList}
    - \`emotion\`: Emotional expression, optional values include ${allEmotions}
    - \`loudness_rate\`: Volume control, range [0.5, 2.0], where 2.0 is double volume and 0.5 is half volume. 1.0 is normal.
- **Note**: Content within VOICE tags will be spoken with the specified voice characteristics and emotions. Use the VOICE tag only when the user explicitly requests a voice change. By default, no special tag is needed.
- **Available Voices and Emotions**:${voiceEmotionList}
