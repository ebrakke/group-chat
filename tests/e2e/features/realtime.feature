Feature: Real-time Updates
  As a member, I want to see live updates
  so I have an instant messaging experience.

  Background:
    Given the app is running at the base URL

  # WebSocket Connection
  Scenario: WebSocket connects on page load
    Given I am logged in as a member
    When the page loads
    Then the WebSocket should connect
    And the WebSocket should authenticate with my token
    And the console should show "WebSocket connected"
    And the console should show "WebSocket authenticated"

  # Live Messages
  Scenario: New message appears instantly
    Given I am logged in as "user1" in the "general" channel
    And "user2" is logged in on another session
    When "user2" sends a message "Real-time test!" via the API
    Then "Real-time test!" should appear in my message list within 2 seconds
    Without refreshing the page

  Scenario: Message edit appears in real-time
    Given I am logged in and viewing "general"
    And "user2" has a message "Before edit" in the channel
    When "user2" edits the message to "After edit"
    Then I should see "After edit" replace "Before edit" within 2 seconds

  Scenario: Message delete appears in real-time
    Given I am logged in and viewing "general"
    And "user2" has a message "Going away" in the channel
    When "user2" deletes the message
    Then "Going away" should disappear from my view within 2 seconds

  # Live Channel Updates
  Scenario: New channel appears in sidebar in real-time
    Given I am logged in
    When another user creates a channel "new-realtime"
    Then "# new-realtime" should appear in my sidebar without refresh

  Scenario: Deleted channel is removed in real-time
    Given I am logged in and a channel "temp-channel" exists
    When another user deletes "temp-channel"
    Then "# temp-channel" should disappear from my sidebar
    And if I was viewing that channel, I should be moved to "# general"

  # Live Reactions
  Scenario: Reaction appears in real-time
    Given I am logged in and viewing a message in "general"
    When another user reacts with "👍" to that message
    Then I should see the "👍" reaction appear on the message

  # Reconnection
  Scenario: WebSocket reconnects after disconnection
    Given I am logged in with an active WebSocket
    When the WebSocket connection drops
    Then the app should automatically attempt to reconnect
    And upon reconnection, I should see new messages that arrived during the disconnect
