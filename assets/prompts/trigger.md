
### 3. TRIGGER

The `<TRIGGER>` tag is used to define conditional actions that automatically execute when specific conditions are met.

**Syntax**:

```xml
<TRIGGER name="trigger_name" description="...">
  <!-- Condition Definition -->
  <condition_logic_structure>
    ...
  </condition_logic_structure>
  
  <!-- Action Definition -->
  <then>
    ...
  </then>
</TRIGGER>
```

**Parameters**:

- [name]: A unique identifier for the trigger
- [description]: A human-readable description of the trigger's function

**Functionality**:

- Uses structured XML syntax to define conditional logic in the format `<condition_logic_structure><then>actions</then></condition_logic_structure>`
- Supports single conditions or logical combinations of multiple conditions (AND, OR, NOT)
- Actions can include any valid XML commands or sequences of commands

**Supported Conditions**:

Triggers can only be composed of the following condition types:

1. **Timer**: Time-based conditions

    - Syntax: `<timer ... />`
    - Example: `<timer hour="9" minute="30" />` (triggers at 9:30 AM)
2. **Face Detection**: Facial recognition conditions

    - Syntax: `<face_detect name="person_name" />`
    - Example: `<face_detect name="主人" />` (triggers when主人is detected)
3. **Power**: Battery level conditions

    - Syntax: `<power value="percentage" />`
    - Example: `<power value="20" />` (triggers when battery is at 20%)

**Condition Logic Rules**:

1. **Single Condition**: Use a single condition tag directly
2. **Multiple Condition Combinations**:
    - `<and>...</and>`: All conditions must be satisfied
    - `<or>...</or>`: Any condition being satisfied is sufficient
    - `<not>...</not>`: Triggered when the condition is not met
3. **Nested Logic**: Supports nested use of logical operators to create complex conditions

**Examples**:

```xml
<TRIGGER name="low_battery_greeting" description="Remind when familiar faces are detected and battery is low">
  <and>
    <or>
      <face_detect name="Alice"/>
      <face_detect name="Bob"/>
    </or>
    <not>
      <power value="20"/>
    </not>
  </and>
  <then>
    Notify the master that I am running out of power, please charge quickly
  </then>
</TRIGGER>
```

```xml
<TRIGGER name="morning_greeting" description="Greet master every morning at 8:00 AM">
  <and>
    <timer hour="8" minute="0" />
    <face_detect name="master" />
  </and>
  <then>
    Good morning!<wave/> Have a nice day!
  </then>
</TRIGGER>
```

```xml
<TRIGGER name="simple_greeting" description="Simple greeting trigger">
  <face_detect name="master"/>
  <then>
    hello<wave/>,master
  </then>
</TRIGGER>
```

**Usage Rules**:

- Defined triggers do not execute immediately, but are activated when conditions are met in subsequent interactions
- Multiple triggers can be active simultaneously
- Triggers persist until explicitly removed or replaced
- Use clear and specific condition descriptions to ensure proper trigger activation
