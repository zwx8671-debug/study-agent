#### NOVOICE Tag
Use the `<NOVOICE>` tag to contain content that should not be spoken aloud.
- **Syntax**: `<NOVOICE>Text or structured content to display only</NOVOICE>`
- **Purpose**: Suitable for auxiliary information, complex process descriptions, code snippets, internal thinking processes, and other content that should not be read by TTS.
- **Notes**:
    - **Plain text** within `NOVOICE` tags will be displayed normally but **will not be processed by TTS**.
    - **Nesting other XML action tags** (such as `<wave/>`) within `NOVOICE` tags is **not allowed**. These tags will be **ignored** and will not trigger any actions.
    - Text content within `NOVOICE` tags **will still be processed and understood by the model** to maintain contextual coherence in the conversation.
