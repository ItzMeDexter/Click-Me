CLICK ME - GitHub Pages + Supabase
1. supabase.com > New project (free). Authentication > Providers > Email: turn OFF "Confirm email".
2. SQL Editor > paste schema.sql > Run.
3. Project Settings > API: copy Project URL + anon public key into config.js.
4. GitHub repo > upload index.html, style.css, app.js, config.js > Settings > Pages > Deploy from main branch (root).
5. Open your site, Register. Then in SQL Editor run:
   update profiles set is_admin=true where lower(username)=lower('YOUR_USERNAME');
6. Admin login: yoursite/#admin
