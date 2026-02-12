Feature: File Uploads
  As a member, I want to share files and images
  so I can collaborate with my team.

  Background:
    Given the app is running at the base URL
    And I am logged in as a member
    And I am in the "general" channel

  # Upload Methods
  Scenario: User uploads a file via the attach button
    When I click the attach/paperclip button
    And I select a file "test-image.png"
    Then I should see a file preview/attachment indicator
    When I click Send
    Then the message should appear with the file attached

  Scenario: User uploads by drag and drop
    When I drag and drop a file "test-file.pdf" onto the message area
    Then I should see a file preview/attachment indicator
    When I click Send
    Then the message should appear with the file attached

  Scenario: User uploads by pasting an image
    When I paste an image from clipboard into the message input
    Then I should see an image preview/attachment indicator
    When I click Send
    Then the message should appear with the image inline

  # Image Display
  Scenario: Image attachments show inline preview
    Given a message with an image attachment exists
    Then the image should be displayed inline in the chat
    And clicking the image should open it full-size

  # File Display
  Scenario: Non-image files show download link
    Given a message with a PDF attachment exists
    Then the attachment should show as a downloadable link
    And clicking it should download the file

  # Upload Limits
  Scenario: Upload fails for files exceeding size limit
    When I try to upload a file larger than 50MB
    Then I should see an error about file size limit

  # Multiple Attachments
  Scenario: User sends a message with text and attachment
    When I type "Check out this file" in the message input
    And I attach a file "document.pdf"
    And I click Send
    Then the message should show both the text and the attachment
