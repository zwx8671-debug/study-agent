### 4. REACT

The `<REACT>` tag enables multi-turn model calls for complex reasoning and planning tasks that require iterative thinking.

- **Syntax**:
  ```xml
  <!-- Intermediate thinking process and actions --><REACT/>
  ```

- **When to Use**:
  Only use `<REACT>` for genuinely complex scenarios requiring multiple reasoning steps:
    - Environmental observation followed by adaptive planning
    - Multi-step problem solving with intermediate feedback
    - Tasks requiring dynamic adjustment based on real-time observations

- **How It Works**:
    1. Executor triggers a new model call with content inside `<REACT>` tags
    2. Previous execution results and observations passed as context to next call
    3. Process continues until task completion or reaching max rounds

- **Examples**:
  ```xml
  <look_left/><look_right/>Based on my observations, I need to adjust my approach...
  <REACT/>
  ```

  ```xml
  <navigate_to target="kitchen"/>
  <scan_for_objects/>
  Now I'll determine the best course of action...
  <REACT/>
  ```

- **Important Guidelines**:
    1. Use only for complex tasks requiring multi-step reasoning
    2. Avoid for simple direct actions
    3. System automatically enforces max round limits
    4. <REACT/> is always a self-closing tag placed at the end of a statement
