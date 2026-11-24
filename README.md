# Paw Aid

A street-dog rescue platform. Citizens report injured, sick or vulnerable street
dogs; partner NGOs accept and resolve the cases; admins oversee everything.

The site is plain HTML, CSS and JavaScript. Accounts, reports and photos are stored in
[Supabase](https://supabase.com) (a hosted PostgreSQL database with built-in login and
file storage), so everything works across devices and users.

## What each type of user can do

| User | How they get an account | What they can do |
|---|---|---|
| **Visitor** (no login) | — | Report a dog, track any report by its ID (e.g. `PA-1001`), send a contact message |
| **Citizen** | Register → "Citizen" | Everything a visitor can, plus a dashboard and "My Reports" list of their own reports |
| **NGO** | Register → "NGO" (use the organisation name), then **an admin approves it** | See open cases and their own cases; accept a case and update its status from the **Update** dropdown (choose *In Progress* to accept, *Resolved* / *Rejected* to close, *Pending* to hand it back); click a report ID or **📷 View photo** for the photo, details and reporter's phone; manage their **Team** list (add, edit, remove members) |
| **Admin** | Promote an existing account with one SQL line (below) | See all reports, assign an NGO from the **NGO** dropdown, remove reports, approve / suspend NGOs, view citizens |

Security is enforced by the database itself (Row Level Security in
`supabase/schema.sql`), so editing the page in a browser can't get around it. Nobody
can make themselves an admin, an NGO can't act until approved, citizens only see their
own reports, and public tracking never shows phone numbers.

## Setup (about 10 minutes)

### 1. Create a Supabase project
1. Sign up at [supabase.com](https://supabase.com) (free plan is enough) and create a new project.
2. Wait for it to finish setting up.

### 2. Create the database
1. In the project, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   It creates the tables, security rules and the photo storage bucket. It is safe to run again.

### 3. Connect the website
1. In Supabase open **Project Settings → API** (or **Connect**).
2. Copy the **Project URL** and the **anon / publishable** key.
3. Paste them into [`config.js`](config.js).
   Never use the `service_role` / secret key in the website.

### 4. Set the login redirect address
In **Authentication → URL Configuration**:
- **Site URL**: the address where the site runs, e.g. `http://localhost:8000` while testing,
  or your live address (e.g. `https://<your-username>.github.io/Paw_aid/`).
- **Redirect URLs**: add the same address followed by `/**`.

This is where the "confirm your email" and "reset password" links send people.

> Tip for a quick demo: in **Authentication → Sign In / Providers → Email** you can turn off
> **Confirm email**, so new accounts can log in immediately without checking their inbox.

### 5. Make yourself the admin
1. Open the site and **Register** as a normal citizen with your own email.
2. Back in **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Log in — you'll land on the Admin dashboard.

### 6. Run the site
The pages must be served over `http://` (not opened as a file). From the project folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

To put it online for free, enable **GitHub Pages** for this repository
(Settings → Pages → deploy from the `main` branch), or drag the folder into
[Netlify Drop](https://app.netlify.com/drop). Remember to add the live address in step 4.

## Typical flow to demo

1. A visitor or citizen files a report on **Report a Dog** and gets a tracking ID.
2. An NGO registers; the admin approves it under **Admin → NGOs**.
3. The NGO sees the report under **All Reports**, sets **Update → In Progress** to accept it,
   then **Resolved** when done.
   (Or the admin assigns it from **Admin → All Reports → NGO**.)
4. Anyone enters the tracking ID on **Track a Report** to see each step with dates.

## Project files

| File | Purpose |
|---|---|
| `*.html` | The pages (design unchanged) |
| `reset-password.html` | Where the "Forgot password?" email link lands |
| `style.css` | Styles |
| `script.js` | All page logic: login, reports, dashboards, connects to Supabase |
| `config.js` | Your Supabase URL and public key |
| `supabase/schema.sql` | Database tables, security rules, actions and photo storage |

## Where to find other data
- **Contact form messages** are saved in the `contact_messages` table: open
  **Table Editor → contact_messages** in Supabase.
- **NGO team members** are managed by each NGO under **NGO dashboard → Team** and stored in the `ngo_members` table.
- **Dog photos**: on the NGO and admin dashboards, click a report ID or **📷 View photo** to see the photo, full details and the reporter's phone number.
