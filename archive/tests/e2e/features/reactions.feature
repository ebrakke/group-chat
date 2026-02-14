Feature: Reactions
  As a member, I want to react to messages with emoji
  so I can express myself quickly.

  Background:
    Given the app is running at the base URL
    And I am logged in as a member
    And I am in the "general" channel
    And a message "React to me" exists from another user

  # Adding Reactions
  Scenario: User adds a reaction to a message
    When I hover over the message "React to me"
    And I click the reaction button
    And I select the "👍" emoji
    Then a "👍" reaction badge should appear on the message
    And the badge should show count "1"

  Scenario: Multiple users react with same emoji
    Given "alice" has already reacted with "👍"
    When I also react with "👍"
    Then the "👍" badge should show count "2"

  Scenario: Multiple different reactions on one message
    When I react with "👍"
    And "alice" reacts with "❤️"
    And "bob" reacts with "😂"
    Then the message should show three reaction badges
    And each badge should show the correct count

  # Removing Reactions
  Scenario: User removes their own reaction
    Given I have reacted with "👍" to the message
    When I click on the "👍" reaction badge
    Then my reaction should be removed
    And the badge count should decrease by 1

  Scenario: Reaction badge disappears when count reaches zero
    Given I am the only one who reacted with "👍"
    When I click on the "👍" badge to remove it
    Then the "👍" badge should disappear entirely

  # Reaction Display
  Scenario: My reactions are visually highlighted
    Given I have reacted with "👍" to a message
    Then the "👍" badge should be visually highlighted (different style)
    And other users' reactions I haven't joined should not be highlighted

  # Real-time Reactions
  Scenario: Reaction appears in real-time
    Given I am viewing the message
    When another user reacts with "🎉" to the message
    Then the "🎉" badge should appear without me refreshing
