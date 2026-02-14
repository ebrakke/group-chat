Feature: Admin
  As an admin, I want to manage users and content
  so I can keep the chat server running smoothly.

  Background:
    Given the app is running at the base URL

  # Admin Panel Access
  Scenario: Admin sees Admin Panel link
    Given I am logged in as an admin
    Then I should see an "Admin Panel" link in the sidebar

  Scenario: Regular member does not see Admin Panel
    Given I am logged in as a regular member
    Then I should not see an "Admin Panel" link

  # Invite Management
  Scenario: Admin generates invite links
    Given I am logged in as an admin
    When I go to the Admin Panel
    And I click "Generate Invite"
    Then a new invite link should be created
    And it should appear in the invite list

  Scenario: Admin sees list of active invites
    Given I am logged in as an admin
    And invite links have been generated
    When I go to the Admin Panel
    Then I should see all active invite links

  # User Management
  Scenario: Admin sees user list
    Given I am logged in as an admin
    When I go to the Admin Panel
    Then I should see a list of all users
    And each user should show their username, display name, and role

  Scenario: Admin promotes a member to admin
    Given I am logged in as an admin
    And a regular member "alice" exists
    When I go to the Admin Panel
    And I promote "alice" to admin
    Then "alice" should now have the admin role

  Scenario: Admin removes a user
    Given I am logged in as an admin
    And a member "baduser" exists
    When I go to the Admin Panel
    And I remove "baduser" from the server
    Then "baduser" should no longer appear in the user list
    And "baduser" should not be able to log in

  # Admin Message Moderation
  Scenario: Admin deletes another user's message
    Given I am logged in as an admin
    And "alice" has sent a message "Inappropriate content" in "general"
    When I hover over Alice's message
    And I click the delete button
    Then the message should be removed from the channel
