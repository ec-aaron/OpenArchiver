# Connecting to Microsoft 365

This guide provides instructions for Microsoft 365 administrators to set up a connection that allows the archiving of all user mailboxes within their organization.

The connection uses the **Microsoft Graph API** and an **App Registration** in Microsoft Entra ID. This is a secure, standard method that grants the archiving service permission to read email data on your behalf without ever needing to handle user passwords.

## Prerequisites

- You must have one of the following administrator roles in your Microsoft 365 tenant: **Global Administrator**, **Application Administrator**, or **Cloud Application Administrator**.

## Setup Overview

The setup process involves four main parts, all performed within the Microsoft Entra admin center and the OpenArchiver application:

1.  Registering a new application identity for the archiver in Entra ID.
2.  Granting the application the specific permissions it needs to read mail.
3.  Creating a secure password (a client secret) for the application.
4.  Entering the generated credentials into the OpenArchiver application.

---

### Part 1: Register a New Application in Microsoft Entra ID

First, you will create an "App registration," which acts as an identity for the archiving service within your Microsoft 365 ecosystem.

1.  Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com).
2.  In the left-hand navigation pane, go to **Identity > Applications > App registrations**.
3.  Click the **+ New registration** button at the top of the page.
4.  On the "Register an application" screen:
    - **Name:** Give the application a descriptive name you will recognize, such as `OpenArchiver Service`.
    - **Supported account types:** Select **"Accounts in this organizational directory only (Default Directory only - Single tenant)"**. This is the most secure option.
    - **Redirect URI (optional):** You can leave this blank.
5.  Click the **Register** button. You will be taken to the application's main "Overview" page.

---

### Part 2: Grant API Permissions

Next, you must grant the application the specific permissions required. The permissions vary based on your deployment mode (see below).

#### For Organization-Wide Mode:
1.  From your new application's page, select **API permissions** from the left-hand menu.
2.  Click the **+ Add a permission** button.
3.  In the "Request API permissions" pane, select **Microsoft Graph**.
4.  Select **Application permissions**. This is critical as it allows the service to run in the background without a user being signed in.
5.  In the "Select permissions" search box, find and check the boxes for **both** permissions:
    - `Mail.Read`
    - `User.Read.All`
6.  Click the **Add permissions** button at the bottom.
7.  **Crucial Final Step:** Click the **"Grant admin consent for [Your Organization's Name]"** button located above the permissions table. Click **Yes** in the confirmation dialog. The status for both permissions should now show a green checkmark.

#### For Single-User Mode:
1.  From your new application's page, select **API permissions** from the left-hand menu.
2.  Click the **+ Add a permission** button.
3.  In the "Request API permissions" pane, select **Microsoft Graph**.
4.  Select **Application permissions** (NOT Delegated permissions).
5.  In the "Select permissions" search box, find and check the box for:
    - `Mail.Read` (Application permission)
6.  **Important**: Do NOT add `User.Read` (that's a delegated permission) or `User.Read.All` (conflicts with Application Access Policies)
7.  Click the **Add permissions** button at the bottom.
8.  **Crucial Final Step:** Click the **"Grant admin consent for [Your Organization's Name]"** button. The status should show a green checkmark.

### Understanding Permission Modes

OpenArchiver supports two deployment modes for Microsoft 365:

#### Organization-Wide Mode (Recommended for Enterprise)
- **Permissions Required**: `Mail.Read` + `User.Read.All`
- **Access Scope**: All mailboxes in the organization
- **Use Case**: Enterprise deployments where you want to archive all users' emails
- **Configuration**: Grant both permissions and admin consent as described above

#### Single-User Mode
- **Permissions Required**: `Mail.Read` (Application permission ONLY)
  - **DO NOT grant User.Read** - it's a delegated permission and won't work with app-only authentication
  - **DO NOT grant User.Read.All** - it conflicts with Application Access Policies
  - **Optional**: `Mail.ReadWrite` and `Mail.Send` (Application permissions) - not currently used by OpenArchiver but safe to grant for future features
- **Access Scope**: Only the specified mailbox
- **Use Case**: Archiving a single shared mailbox or service account with Application Access Policy restrictions
- **Configuration**:
  1. Follow the same setup steps, but only grant `Mail.Read` **Application permission** (not User.Read.All)
  2. **Important**: Ensure it's the **Application** permission, not Delegated
  3. **Important**: Grant admin consent for the Mail.Read permission
  3. Restrict the application's access to a specific mailbox using an Application Access Policy:
     - Connect to Exchange Online PowerShell: `Connect-ExchangeOnline`
     - Create an access policy restricting to your mailbox:
       ```powershell
       New-ApplicationAccessPolicy -AppId <Your-App-ID> -PolicyScopeGroupId <Your-Email-or-SecurityGroup-ID> -AccessRight RestrictAccess -Description "Restrict OpenArchiver to specific mailbox"
       ```
  4. When configuring in OpenArchiver, **enter the mailbox email address** in the "User Email" field (e.g., user@example.com)

**Note**: The system automatically detects which mode to use based on the permissions granted. When using Application Access Policies, the "User Email" field is **required** because the `/me` endpoint doesn't work with client credentials flow.

---

### Part 3: Create a Client Secret

The client secret is a password that the archiving service will use to authenticate. Treat this with the same level of security as an administrator's password.

1.  In your application's menu, navigate to **Certificates & secrets**.
2.  Select the **Client secrets** tab and click **+ New client secret**.
3.  In the pane that appears:
    - **Description:** Enter a clear description, such as `OpenArchiver Key`.
    - **Expires:** Select an expiry duration. We recommend **12 or 24 months**. Set a calendar reminder to renew it before it expires to prevent service interruption.
4.  Click **Add**.
5.  **IMMEDIATELY COPY THE SECRET:** The secret is now visible in the **"Value"** column. This is the only time it will be fully displayed. Copy this value now and store it in a secure password manager before navigating away. If you lose it, you must create a new one.

---

### Part 4: Connecting in OpenArchiver

You now have the three pieces of information required to configure the connection.

1.  **Navigate to Ingestion Sources:**
    In the OpenArchiver application, go to the **Ingestion Sources** page.

2.  **Create a New Source:**
    Click the **"Create New"** button.

3.  **Fill in the Configuration Details:**
    - **Name:** Give the source a name (e.g., "Microsoft 365 Archive").
    - **Provider:** Select **"Microsoft 365"** from the dropdown.
    - **Application (Client) ID:** Go to the **Overview** page of your app registration in the Entra admin center and copy this value.
    - **Directory (Tenant) ID:** This value is also on the **Overview** page.
    - **Client Secret Value:** Paste the secret **Value** (not the Secret ID) that you copied and saved in the previous step.
    - **User Email (Optional):**
      - Leave empty for organization-wide mode
      - **Required for single-user mode**: Enter the email address of the mailbox to archive (e.g., user@example.com)
      - This must match the mailbox restricted by your Application Access Policy

4.  **Save Changes:**
    Click **"Save changes"**.

## What Happens Next?

Once the connection is saved, the system will begin the archiving process:

1.  **User Discovery:** The service will connect to the Microsoft Graph API to discover users:
    - In **organization-wide mode**: Retrieves all users in your organization
    - In **single-user mode**: Retrieves only the mailbox specified in the "User Email" field
2.  **Initial Import:** The system will begin a background job to import the discovered mailboxes, folder by folder. The status will show as **"Importing"**. This can take a significant amount of time.
3.  **Continuous Sync:** After the initial import, the status will change to **"Active"**. The system will use Microsoft Graph's delta query feature to efficiently fetch only new or changed emails, ensuring the archive stays up-to-date.

---

## Troubleshooting

### "Failed to list users" or Permission Errors

If you encounter errors about insufficient permissions:

1. **Verify Permission Grants**: Navigate to your App Registration → API Permissions and ensure:
   - For org-wide mode: Both `Mail.Read` and `User.Read.All` are listed
   - For single-user mode: Both `Mail.Read` and `User.Read` are listed
   - All permissions show a green checkmark in the "Status" column

2. **Grant Admin Consent**: Click "Grant admin consent for [Your Organization]" at the top of the API Permissions page

3. **Regenerate Client Secret**: If permissions were recently changed, create a new client secret and update it in OpenArchiver

4. **Check Application Access Policy** (Single-user mode only):
   - Verify the policy is correctly configured:
     ```powershell
     Get-ApplicationAccessPolicy
     ```
   - Test the policy:
     ```powershell
     Test-ApplicationAccessPolicy -AppId <Your-App-ID> -Identity <Mailbox-Email>
     ```

### "Single-user mode requires configuring the User Email field"

This error occurs when:
- Your app doesn't have User.Read.All permission (single-user mode detected)
- You haven't filled in the "User Email" field in the ingestion source configuration

**Solution**: Edit your ingestion source and enter the email address of the mailbox you want to archive in the "User Email" field.

### Connection Test Succeeds but No Users Found

This typically means:
- **Organization-wide mode**: No active users in the tenant (unlikely)
- **Single-user mode**: Application Access Policy may be too restrictive or mailbox is disabled

Check the application logs for detailed diagnostic information about which mode was detected.
