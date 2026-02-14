Feature: Mobile Responsive
  As a mobile user, I want the app to work well on small screens
  so I can chat on the go.

  Background:
    Given the app is running at the base URL
    And I am on a mobile viewport (375x667)
    And I am logged in as a member

  # Sidebar
  Scenario: Sidebar is hidden by default on mobile
    When the page loads
    Then the sidebar should be hidden
    And I should see a hamburger menu button

  Scenario: Sidebar opens as a drawer on mobile
    When I tap the hamburger menu button
    Then the sidebar should slide in as a drawer overlay
    And I should see the channel list

  Scenario: Selecting a channel closes the sidebar drawer
    Given the sidebar drawer is open
    When I tap on "# general"
    Then the sidebar drawer should close
    And I should see the "# general" channel content

  # Message Input
  Scenario: Message input is visible and usable on mobile
    When I am viewing a channel
    Then the message input should be visible at the bottom
    And I should be able to tap and type in it
    And the keyboard should appear

  Scenario: Viewport adjusts when keyboard opens
    When I tap the message input
    And the mobile keyboard appears
    Then the message list and input should remain visible
    And the input should not be hidden behind the keyboard

  # Thread Panel
  Scenario: Thread panel is full screen on mobile
    When I tap on a message's reply button
    Then the thread panel should take the full screen
    And I should see a back/close button
    When I tap the back button
    Then I should return to the channel view

  # General
  Scenario: No horizontal scroll on mobile
    When I view any page
    Then there should be no horizontal scrollbar
    And all content should fit within the viewport width
