# Paw Aid

A street-dog rescue platform. Citizens report injured, sick or vulnerable street
dogs; partner NGOs accept and resolve the cases; admins oversee everything.

## 🌐 Live website

**https://riyariya184.github.io/Paw_aid/**

The project is already deployed and working — nothing needs to be installed to use it:

- **Website:** hosted on GitHub Pages and updated automatically from the `main` branch.
- **Database, logins and photos:** a live [Supabase](https://supabase.com) project
  (PostgreSQL database with built-in login and file storage), hosted in the cloud
  (Mumbai region).

It works from any phone or computer, and everyone sees the same live data.

## What each type of user can do

| User | How they get an account | What they can do |
|---|---|---|
| **Visitor** (no login) | — | Report a dog, track any report by its ID (e.g. `PA-1001`), send a contact message |
| **Citizen** | Register → "Citizen" | Everything a visitor can, plus a dashboard and "My Reports" list of their own reports |
| **NGO** | Register → "NGO" (use the organisation name), then **an admin approves it** | See open cases and their own cases; accept a case and update its status from the **Update** dropdown (choose *In Progress* to accept, *Resolved* / *Rejected* to close, *Pending* to hand it back); click a report ID or **📷 View photo** for the photo, details and reporter's phone; manage their **Team** list (add, edit, remove members) |
| **Admin** | An existing account is promoted with one SQL line (see setup step 5) | See all reports, assign an NGO from the **NGO** dropdown, remove reports, approve / suspend NGOs, view citizens, open any report's photo |

Security is enforced by the database itself (Row Level Security in
`supabase/schema.sql`), so editing the page in a browser can't get around it. Nobody
can make themselves an admin, an NGO can't act until approved, citizens only see their
own reports, each NGO manages only its own team, and public tracking never shows phone
numbers.

## How to demo it

Use a different email address for each role.

1. **Register an NGO** — on Register choose "NGO". Its dashboard says it is waiting for approval.
2. **Approve it** — log in as the admin, open **NGOs** and click **Approve**.
3. **Report a dog** — log out, open **Report a Dog**, add a photo if you like, submit, and note the tracking ID.
4. **Handle it as the NGO** — log in as the NGO, set **Update → In Progress** to accept the case,
   click **📷 View photo** to see the photo and reporter's phone, then set **Resolved**.
   (The admin can also assign a case from **Admin → All Reports → NGO**.)
5. **Manage the team** — as the NGO, open **Team**, add a member, then **Edit** and **Save**.
6. **Track it** — anyone enters the tracking ID on **Track a Report** to see each step with dates.

## Project files

| File | Purpose |
|---|---|
| `*.html` | The pages (original design, plus a few small additions such as the team editor and photo links) |
| `reset-password.html` | Where the "Forgot password?" email link lands |
| `style.css` | Styles |
| `script.js` | All page logic: login, reports, dashboards, team, photos; connects to Supabase |
| `config.js` | The Supabase project address and its public key |
| `supabase/schema.sql` | Database tables, security rules, actions and photo storage |

## Where to find other data
- **Contact form messages** are saved in the `contact_messages` table: open
  **Table Editor → contact_messages** in Supabase.
- **NGO team members** are managed by each NGO under **NGO dashboard → Team** and stored in the `ngo_members` table.
- **Dog photos**: on the NGO and admin dashboards, click a report ID or **📷 View photo** to see the photo, full details and the reporter's phone number.

---

## Setting it up from scratch

> **This is already done for the live project above.** These steps are only needed to
> create a brand-new copy of Paw Aid with its own database.

### 1. Create a Supabase project
1. Sign up at [supabase.com](https://supabase.com) (free plan is enough) and create a new project.
2. Wait for it to finish setting up.

### 2. Create the database
1. In the project, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   It creates the tables, security rules and the photo storage bucket. It is safe to run again.

### 3. Connect the website
1. In Supabase open **Project Settings → API Keys**.
2. Copy the **Project URL** and the **anon / public** key.
3. Paste them into [`config.js`](config.js).
   Never use the `service_role` / secret key in the website.

### 4. Set the login redirect address
In **Authentication → URL Configuration**:
- **Site URL**: your live address, e.g. `https://<your-username>.github.io/Paw_aid/`.
- **Redirect URLs**: add the same address followed by `/**`.
  If you also test on your own computer, add `http://localhost:8000/**` too.

This is where the "confirm your email" and "reset password" links send people.

> Tip for a quick demo: in **Authentication → Sign In / Providers** you can turn off
> **Confirm email**, so new accounts can log in immediately without checking their inbox.

### 5. Make yourself the admin
1. Open the site and **Register** as a normal citizen with your own email.
2. Back in **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
3. Log in — you'll land on the Admin dashboard.

### 6. Put it online
Enable **GitHub Pages** for the repository (Settings → Pages → deploy from the `main`
branch), or drag the folder into [Netlify Drop](https://app.netlify.com/drop).
Remember to use that address in step 4.

### Optional: run it on your own computer
Only needed for testing changes before publishing them. The pages must be served over
`http://` (not opened as a file). From the project folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. It uses the same live database as the website.
