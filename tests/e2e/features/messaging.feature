Feature: Messaging
  As a member, I want to send, edit, and delete messages
  so I can communicate with my team.

  Background:
    Given the app is running at the base URL
    And I am logged in as a member
    And I am in the "general" channel

  # Sending Messages
  Scenario: User sends a message
    When I type "Hello world!" in the message input
    And I click the "Send" button
    Then the message "Hello world!" should appear in the message list
    And the message should show my display name
    And the message should show a timestamp
    And the message input should be cleared

  Scenario: User sends a message with Enter key
    When I type "Sent with enter" in the message input
    And I press Enter
    Then the message "Sent with enter" should appear in the message list

  Scenario: Shift+Enter creates a new line instead of sending
    When I type "Line 1" in the message input
    And I press Shift+Enter
    And I type "Line 2"
    And I press Enter
    Then a message with "Line 1" and "Line 2" should appear

  Scenario: Cannot send an empty message
    When the message input is empty
    Then the "Send" button should be disabled

  # Real-time Updates
  Scenario: Messages appear in real-time without refresh
    Given another user "alice" is logged in on a different session
    When "alice" sends "Hello from Alice!" to "general"
    Then I should see "Hello from Alice!" appear in my message list
    And I should not need to refresh the page

  Scenario: Real-time messages from multiple users
    Given users "alice" and "bob" are in "general"
    When "alice" sends "Hi from Alice"
    And "bob" sends "Hi from Bob"
    Then I should see both messages appear in order

  # Editing Messages
  Scenario: User edits their own message
    Given I have sent a message "Original text"
    When I hover over my message
    And I click the edit button
    Then the message should become an editable input
    When I change the text to "Edited text"
    And I press Enter to save
    Then the message should show "Edited text"
    And the message should show an "(edited)" indicator

  Scenario: User cancels editing a message
    Given I have sent a message "Don't change me"
    When I start editing the message
    And I press Escape
    Then the message should still show "Don't change me"

  Scenario: User cannot edit another user's message
    Given "alice" has sent a message "Alice's message"
    When I hover over Alice's message
    Then I should not see an edit button

  # Deleting Messages
  Scenario: User deletes their own message
    Given I have sent a message "Delete me"
    When I hover over my message
    And I click the delete button
    Then the message "Delete me" should be removed from the list

  Scenario: User cannot delete another user's message
    Given "alice" has sent a message
    When I hover over Alice's message
    Then I should not see a delete button

  Scenario: Admin can delete any message
    Given I am logged in as an admin
    And "alice" has sent a message "Rule violation"
    When I hover over Alice's message
    And I click the delete button
    Then the message should be removed

  # Message Display
  Scenario: Messages are shown in chronological order
    Given messages "First", "Second", "Third" were sent in order
    Then they should appear in chronological order in the message list

  Scenario: Message list scrolls to bottom on new message
    Given the message list is scrollable
    When a new message arrives
    Then the list should auto-scroll to the bottom

  Scenario: Scroll-to-bottom button appears when scrolled up
    Given the message list has many messages
    When I scroll up in the message list
    Then a scroll-to-bottom button should appear
    When I click the scroll-to-bottom button
    Then the list should scroll to the bottom
