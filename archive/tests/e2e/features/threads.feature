Feature: Threads
  As a member, I want to start and participate in threaded conversations
  so discussions stay organized.

  Background:
    Given the app is running at the base URL
    And I am logged in as a member
    And I am in the "general" channel
    And a message "Thread starter" exists in the channel

  # Starting a Thread
  Scenario: User starts a thread on a message
    When I hover over the message "Thread starter"
    And I click the reply/thread button
    Then a thread panel should slide in from the right
    And the thread panel should show the original message "Thread starter"
    And the thread panel should have a reply input

  # Replying in a Thread
  Scenario: User replies in a thread
    Given the thread panel is open for "Thread starter"
    When I type "This is a reply" in the thread reply input
    And I click Send (or press Enter)
    Then "This is a reply" should appear in the thread panel
    And the original message should show "1 reply" indicator

  Scenario: Multiple replies show in thread
    Given the thread panel is open for "Thread starter"
    When I send replies "Reply 1", "Reply 2", "Reply 3"
    Then all three replies should appear in order in the thread panel
    And the original message should show "3 replies" indicator

  # Also Send to Channel
  Scenario: Reply with "Also send to channel" checked
    Given the thread panel is open for "Thread starter"
    When I check "Also send to channel"
    And I type "Shared reply" and send
    Then "Shared reply" should appear in the thread panel
    And "Shared reply" should also appear in the main channel message list

  Scenario: Reply without "Also send to channel"
    Given the thread panel is open for "Thread starter"
    When "Also send to channel" is unchecked
    And I type "Thread-only reply" and send
    Then "Thread-only reply" should appear in the thread panel
    And "Thread-only reply" should NOT appear in the main channel message list

  # Thread Panel UI
  Scenario: Close thread panel
    Given the thread panel is open
    When I click the close button on the thread panel
    Then the thread panel should slide out / close

  Scenario: Thread panel shows on mobile as full screen
    Given I am on a mobile viewport
    When I open a thread
    Then the thread panel should take the full screen
    And there should be a back button to return to the channel

  # Real-time Thread Updates
  Scenario: Thread reply appears in real-time
    Given the thread panel is open for "Thread starter"
    And another user "alice" is logged in
    When "alice" replies "Alice's reply" in the same thread
    Then "Alice's reply" should appear in my thread panel without refresh
