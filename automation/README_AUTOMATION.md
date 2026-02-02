# Automation System

This system allows for automated login and verification of AI websites using a configuration-driven approach.

## Structure

- **`config.json`**: The central configuration file.
  - `sms`: Configuration for the SMS provider (URL, regex patterns, timeouts).
  - `sites`: A list of sites to automate. Each site has:
    - `id`, `name`, `url`: Basic info.
    - `keywords`: Keywords to filter SMS messages.
    - `actions`: A dictionary of action phases (`init`, `fillPhone`, `triggerSms`, `fillCode`, `verifyLogin`).

- **`run_generic.js`**: The main script. It reads `config.json` and executes the defined actions using Playwright.
- **`sms_provider.js`**: Handles fetching and parsing SMS messages from the configured provider.

## How to Run

```bash
node automation/run_generic.js
```

## Adding a New Site

1. Open `automation/config.json`.
2. Add a new entry to the `sites` array.
3. Define the `actions` for each phase. Supported action types:
   - `goto`: Navigate to a URL.
   - `click`: Click an element.
   - `fill`: Fill an input field. Supports `{phoneNumber}` and `{code}` placeholders.
   - `check`: Check a checkbox.
   - `wait`: Wait for a timeout or a selector.
   - `waitForSelector`: Wait for an element to appear.
   - `waitForUrl`: Wait for the URL to match a pattern.

## Example Configuration

```json
{
  "id": "example",
  "name": "Example Site",
  "url": "https://example.com",
  "actions": {
    "init": [
      { "type": "goto", "url": "https://example.com/login" }
    ],
    "fillPhone": [
      { "type": "fill", "selector": "#phone", "value": "{phoneNumber}" }
    ],
    ...
  }
}
```
