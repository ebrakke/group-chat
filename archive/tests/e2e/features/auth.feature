Feature: Authentication
  As a user, I want to sign up, log in, and manage my session
  so I can use Relay Chat securely.

  Background:
    Given the app is running at the base URL
    And the database has been reset

  # First User / Admin Setup
  Scenario: First user becomes admin
    Given no users exist in the system
    When I navigate to the app
    Then I should see the "Welcome to Relay Chat" signup form
    When I fill in "username" with "admin1"
    And I fill in "displayName" with "Admin User"
    And I fill in "password" with "testpass123"
    And I click the "Create Account" button
    Then I should be redirected to the main chat
    And I should see "# general" in the sidebar
    And my role should be "admin"

  # Invite Flow
  Scenario: Admin generates an invite link
    Given I am logged in as an admin
    When I navigate to the Admin Panel
    And I click "Generate Invite"
    Then I should see an invite link
    And the invite link should be copyable

  Scenario: New user signs up with invite link
    Given an invite link has been generated
    When I navigate to the invite link
    Then I should see the signup form
    When I fill in "username" with "newuser"
    And I fill in "displayName" with "New User"
    And I fill in "password" with "testpass123"
    And I click the "Sign Up" button
    Then I should be redirected to the main chat
    And I should see "# general" in the sidebar
    And my role should be "member"

  Scenario: Signup fails without invite code when required
    Given users already exist and invites are required
    When I navigate to the login page
    And I try to sign up without an invite code
    Then I should see an error "Invite code required"

  Scenario: Signup fails with invalid invite code
    Given users already exist
    When I navigate to an invalid invite link
    And I fill in the signup form
    And I click the "Sign Up" button
    Then I should see an error about invalid invite

  Scenario: Signup fails with duplicate username
    Given a user "existinguser" already exists
    When I try to sign up with username "existinguser"
    Then I should see an error about username already taken

  # Login
  Scenario: User logs in with valid credentials
    Given a user "testuser" exists with password "testpass123"
    When I navigate to the login page
    And I fill in "username" with "testuser"
    And I fill in "password" with "testpass123"
    And I click the "Log In" button
    Then I should be redirected to the main chat

  Scenario: Login fails with wrong password
    Given a user "testuser" exists
    When I navigate to the login page
    And I fill in "username" with "testuser"
    And I fill in "password" with "wrongpassword"
    And I click the "Log In" button
    Then I should see an error "Invalid credentials"

  Scenario: Login fails with non-existent user
    When I navigate to the login page
    And I fill in "username" with "nonexistent"
    And I fill in "password" with "testpass123"
    And I click the "Log In" button
    Then I should see an error "Invalid credentials"

  # Session
  Scenario: User stays logged in after page refresh
    Given I am logged in as "testuser"
    When I refresh the page
    Then I should still be on the main chat
    And I should see my username in the sidebar

  Scenario: User logs out
    Given I am logged in as "testuser"
    When I click the logout button
    Then I should be redirected to the login page
    And I should not be able to access the main chat
