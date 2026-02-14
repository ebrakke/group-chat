Feature: Channels
  As a member, I want to create, browse, and manage channels
  so I can organize conversations.

  Background:
    Given the app is running at the base URL
    And I am logged in as a member

  # Default Channel
  Scenario: General channel exists by default
    When I look at the sidebar
    Then I should see "# general" in the channel list
    And "# general" should be selected by default

  # Browsing
  Scenario: User sees all channels in sidebar
    Given channels "general", "random", and "dev" exist
    When I look at the sidebar
    Then I should see all three channels listed

  Scenario: User switches between channels
    Given channels "general" and "random" exist
    When I click on "# random" in the sidebar
    Then the main panel should show "# random"
    And the message list should update to show random's messages
    And the input placeholder should say "Message #random"

  # Creating Channels
  Scenario: Member creates a new channel
    When I click the "+" button next to CHANNELS
    And I fill in the channel name with "new-channel"
    And I fill in the description with "A test channel"
    And I click "Create"
    Then "# new-channel" should appear in the sidebar
    And I should be switched to "# new-channel"

  Scenario: Cannot create channel with duplicate name
    Given a channel "existing" already exists
    When I try to create a channel named "existing"
    Then I should see an error about duplicate channel

  Scenario: Channel name validation
    When I try to create a channel with an empty name
    Then I should see a validation error

  # Editing Channels
  Scenario: Member edits a channel's name and description
    Given I am in channel "test-channel"
    When I open the channel menu
    And I click "Edit Channel"
    And I change the name to "renamed-channel"
    And I change the description to "Updated description"
    And I click "Save"
    Then the channel header should show "# renamed-channel"
    And the description should show "Updated description"

  # Deleting Channels
  Scenario: Member deletes a channel
    Given a channel "to-delete" exists
    When I navigate to "# to-delete"
    And I open the channel menu
    And I click "Delete Channel"
    And I confirm the deletion
    Then "# to-delete" should no longer appear in the sidebar
    And I should be switched to "# general"

  Scenario: Cannot delete the general channel
    When I navigate to "# general"
    And I open the channel menu
    Then I should not see a "Delete Channel" option
