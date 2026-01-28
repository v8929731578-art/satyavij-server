const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= FLAGS ================= */
let SIGNUP_ENABLED = true;

/* ================= PATHS ================= */
const DATA = "E:/SATYAVIJ-SAAS";
const USERS_DIR = path.join(DATA, "users");
const USERS_DB = path.join(DATA, "users.json");
const CHAT_DB = path.join(DATA, "chat.json");

/* ================= INIT ================= */
[DATA, USERS_DIR].forEach(d => !fs.existsSync(d) && fs.mkdirSync(d,{recursive:true}));

if(!fs.existsSync(USERS_DB)){
  fs.writeFileSync(
    USERS_DB,
    JSON.stringify([{
      username:"admin",
      password:bcrypt.hashSync("admin123",10),
      role:"admin",
      disabled:false
    }],null,2)
  );
}
if(!fs.existsSync(CHAT_DB)) fs.writeFileSync(CHAT_DB,"[]");

/* ================= MIDDLEWARE ================= */
app.use(express.urlencoded({extended:true}));
app.use(express.json());
app.use(session({
  secret:"satyavij-secret",
  resave:false,
  saveUninitialized:false
}));

/* ================= HELPERS ================= */
const users = ()=>JSON.parse(fs.readFileSync(USERS_DB));
const saveUsers = u=>fs.writeFileSync(USERS_DB,JSON.stringify(u,null,2));

const auth = (r,s,n)=>r.session.user ? n() : s.redirect("/login");
const adminOnly = (r,s,n)=>{
  if(r.session.user && r.session.user.role==="admin") return n();
  return s.send("❌ Unauthorized");
};

function getFolderSizeMB(folder){
  let size = 0;
  if(!fs.existsSync(folder)) return "0";
  fs.readdirSync(folder).forEach(f=>{
    size += fs.statSync(path.join(folder,f)).size;
  });
  return (size/(1024*1024)).toFixed(2);
}

// Calculator page - sab users ke liye
app.get("/calculator", auth, (req, res) => {
  res.redirect("https://v0-calculator4insights.vercel.app/");
});

/* ===== FILE ICON HELPER (ADD HERE) ===== */
function icon(ext){
  ext = ext.toLowerCase();
  if(["jpg","png","jpeg","gif","webp"].includes(ext)) return "🖼️";
  if(["mp4","mkv","avi"].includes(ext)) return "🎥";
  if(["mp3","wav"].includes(ext)) return "🎵";
  if(["pdf"].includes(ext)) return "📄";
  if(["zip","rar","7z"].includes(ext)) return "📦";
  return "📁";
}

/* ================= STORAGE ================= */
const storage = multer.diskStorage({
  destination:(r,f,c)=>{
    const d = path.join(USERS_DIR,r.session.user.username);
    !fs.existsSync(d)&&fs.mkdirSync(d,{recursive:true});
    c(null,d);
  },
  filename:(r,f,c)=>c(null,f.originalname)
});
const upload = multer({storage});

/* ================= ADMIN (FIXED – ONLY BUG FIX) ================= */
app.get("/admin", auth, adminOnly, (req,res)=>{
  const list = users();

  let out = `
  <html><body style="background:#0f172a;color:white;font-family:sans-serif">
  <h2>👑 Admin Panel</h2>
  <a href="/">⬅ Back</a><hr>
  `;

  const normalUsers = list.filter(u=>u.username!=="admin");

  if(normalUsers.length===0){
    out += "<p>No users registered yet.</p>";
  }

  normalUsers.forEach(u=>{
    const dir = path.join(USERS_DIR,u.username);
    const files = fs.existsSync(dir)?fs.readdirSync(dir):[];

    out += `<h4>👤 ${u.username}</h4>`;
    out += `<p>Storage: ${getFolderSizeMB(dir)} MB</p>`;

    if(files.length===0) out += "<i>No files</i><br>";

    files.forEach(f=>{
      out += `
      ${f}
      <a href="/admin/download/${u.username}/${f}">⬇</a>
      <a href="/admin/delete-file/${u.username}/${f}">🗑</a><br>`;
    });

    out += `<a href="/admin/delete-user/${u.username}" style="color:red">Delete User</a><hr>`;
  });

  res.send(out+"</body></html>");
});

app.get("/admin/delete-user/:u", auth, adminOnly, (r,s)=>{
  saveUsers(users().filter(x=>x.username!==r.params.u));
  fs.rmSync(path.join(USERS_DIR,r.params.u),{recursive:true,force:true});
  s.redirect("/admin");
});

app.get("/admin/download/:u/:f", auth, adminOnly, (r,s)=>{
  s.download(path.join(USERS_DIR,r.params.u,r.params.f));
});

app.get("/admin/delete-file/:u/:f", auth, adminOnly, (r,s)=>{
  fs.unlinkSync(path.join(USERS_DIR,r.params.u,r.params.f));
  s.redirect("/admin");
});

/* ================= LOGIN ================= */
app.get("/login",(r,s)=>s.send(premiumLogin()));

app.post("/login",async(r,s)=>{
  const u = users().find(x=>x.username===r.body.u);
  if(!u || u.disabled || !await bcrypt.compare(r.body.p,u.password)){
    return s.send("Invalid");
  }
  r.session.user={username:u.username,role:u.role};
  s.redirect("/");
});

/* ================= SIGNUP ================= */
app.get("/signup",(r,s)=>{
  if(!SIGNUP_ENABLED) return s.send("Signup disabled");
  s.send(premiumSignup());
});

app.post("/signup",async(r,s)=>{
  const list=users();
  if(list.find(x=>x.username===r.body.u)) return s.send("User exists");
  list.push({
    username:r.body.u,
    password:await bcrypt.hash(r.body.p,10),
    role:"user",
    disabled:false
  });
  saveUsers(list);
  s.redirect("/login");
});

app.get("/logout",(r,s)=>r.session.destroy(()=>s.redirect("/login")));

/* ================= DASHBOARD / VAULT / CHAT ================= */
const interior = (title,content,user)=>`
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
:root{
--bg:#0a0f1f;--panel:#0f172a;--card:#111936;
--border:rgba(148,163,184,.15);
--primary:#7c7cff;--accent:#6cf2c2;
--text:#e5e7eb;--muted:#94a3b8;
}
body{
margin:0;font-family:Inter,system-ui;
background:var(--bg);color:var(--text);
display:flex;height:100vh;
}
.sidebar{
width:240px;background:linear-gradient(180deg,#0f172a,#0b1022);
border-right:1px solid var(--border);
padding:22px;
}
.logo{font-weight:900;font-size:20px;color:var(--accent);margin-bottom:30px}
.nav a{
display:flex;gap:10px;
padding:12px 14px;margin-bottom:6px;
border-radius:14px;color:var(--muted);
text-decoration:none;font-weight:600;
}
.nav a:hover{background:#1f2a44;color:var(--accent)}
.main{flex:1;display:flex;flex-direction:column}
.topbar{
height:64px;border-bottom:1px solid var(--border);
display:flex;justify-content:space-between;
align-items:center;padding:0 24px;
background:#0b1022;
}
.content{padding:24px;overflow:auto}
.card{
background:rgba(17,25,54,.8);
border:1px solid var(--border);
border-radius:22px;
padding:24px;margin-bottom:20px;
box-shadow:0 20px 60px rgba(0,0,0,.4);
}
.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
gap:20px;
}
.btn{
background:linear-gradient(135deg,var(--primary),var(--accent));
border:none;color:#020617;
padding:12px 16px;border-radius:14px;
font-weight:800;cursor:pointer;
}
</style>
</head>
<body>

<div class="sidebar">
  <div class="logo">Satyavij</div>
  <div class="nav">
    <a href="/">🏠 Dashboard</a>
    <a href="/vault">📦 Vault</a>
    <a href="/chat">💬 Chat</a>
    <a class="nav-link" href="/calculator" target="_blank">
  <span class="nav-icon">🧮</span> <span>Calculator</span>
</a>
    ${user.role==="admin"?'<a href="/admin">👑 Admin</a>':''}
  </div>
</div>

<div class="main">
  <div class="topbar">
    <div>${title}</div>
    <div>
      <span style="color:var(--muted)">${user.username}</span>
      <a href="/logout" style="color:var(--accent);margin-left:14px">Logout</a>
    </div>
  </div>
  <div class="content">${content}</div>
</div>

</body>
</html>`;

/* ================= DASHBOARD (RESTORED) ================= */
app.get("/",auth,(r,s)=>{
  s.send(interior("Dashboard",`
    <div class="grid">
      <div class="card"><h3>📊 Storage</h3><p>Overview</p></div>
      <div class="card"><h3>📦 Files</h3><p>Manage uploads</p></div>
      <div class="card"><h3>💬 Chat</h3><p>Messages</p></div>
    </div>

    <div class="card">
      <h3>⚡ Quick Upload</h3>
      <form method="post" action="/upload" enctype="multipart/form-data">
        <input type="file" name="files" multiple>
        <button class="btn">Upload Files</button>
      </form>
    </div>
  `,r.session.user));
});

app.post("/upload",auth,upload.array("files"),(r,s)=>s.redirect("/vault"));

/* ================= VAULT – PHASE 1 ================= */

app.get("/vault", auth, (req, res) => {
  const user = req.session.user.username;
  const userDir = path.join(USERS_DIR, user);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });

  const files = fs.readdirSync(userDir).map(name => {
    const p = path.join(userDir, name);
    const s = fs.statSync(p);
    return {
      name,
      size: (s.size / 1024).toFixed(1),
      time: new Date(s.mtime).toLocaleString(),
      ext: path.extname(name).slice(1)
    };
  });

  const totalSize = files.reduce((a, b) => a + Number(b.size), 0).toFixed(1);

  res.send(interior("Vault", `
<style>
.vault-top{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:20px}
.search{flex:1;padding:12px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--text)}
.upload-box{
border:2px dashed var(--border);
padding:30px;
border-radius:20px;
text-align:center;
cursor:pointer;
margin-bottom:20px;
transition:.3s;
}
.upload-box:hover{border-color:var(--accent);background:rgba(108,242,194,.05)}
.files{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
.file{
background:var(--card);
border:1px solid var(--border);
border-radius:18px;
padding:16px;
transition:.3s;
}
.file:hover{transform:translateY(-4px)}
.icon{font-size:34px}
.meta{font-size:12px;color:var(--muted)}
.actions{display:flex;gap:10px;margin-top:10px}
.actions a{color:var(--accent);text-decoration:none;font-size:13px}
.bar{height:10px;background:#020617;border-radius:10px;overflow:hidden}
.bar span{display:block;height:100%;background:linear-gradient(90deg,var(--primary),var(--accent))}
</style>

<div class="card">
  <h3>📊 Storage Usage</h3>
  <div class="bar"><span style="width:${Math.min(totalSize,100)}%"></span></div>
  <div class="meta">${totalSize} KB used</div>
</div>

<div class="vault-top">
  <input class="search" placeholder="Search files..." oninput="filter(this.value)">
</div>

<div class="files" id="files">
${files.map(f => `
<div class="file" data-name="${f.name.toLowerCase()}">
  <div class="icon">${icon(f.ext)}</div>
  <b>${f.name}</b>
  <div class="meta">${f.size} KB • ${f.time}</div>
  <div class="actions">
    <a href="/download/${encodeURIComponent(f.name)}">⬇ Download</a>
    <a href="/delete/${encodeURIComponent(f.name)}">🗑 Delete</a>
  </div>
</div>
`).join("")}
</div>

<script>
function filter(q){
  q=q.toLowerCase();
  document.querySelectorAll(".file").forEach(f=>{
    f.style.display=f.dataset.name.includes(q)?"block":"none";
  });
}
</script>
  `, req.session.user));
});

/* ================= FILE ACTIONS ================= */

app.get("/download/:f", auth, (req, res) => {
  const filePath = path.join(
    USERS_DIR,
    req.session.user.username,
    req.params.f
  );

  if (!fs.existsSync(filePath)) {
    return res.send("❌ File not found");
  }

  res.download(filePath);
});

app.get("/delete/:f", auth, (req, res) => {
  const filePath = path.join(
    USERS_DIR,
    req.session.user.username,
    req.params.f
  );

  if (!fs.existsSync(filePath)) {
    return res.send("❌ File not found");
  }

  fs.unlinkSync(filePath);
  res.redirect("/vault");
});

/* ================= CHAT ================= */
app.get("/chat", auth, (req, res) => {
  const user = req.session.user.username;
  const msgs = JSON.parse(fs.readFileSync(CHAT_DB));

  res.send(interior("Chat", `
<style>
.chat-wrap{
  height:70vh;
  display:flex;
  flex-direction:column;
  background:rgba(15,23,42,.6);
  border:1px solid var(--border);
  border-radius:22px;
}
.chat-head{
  padding:14px 18px;
  border-bottom:1px solid var(--border);
  font-weight:700;
}
.chat-body{
  flex:1;
  padding:18px;
  overflow-y:auto;
}
.msg{
  max-width:68%;
  padding:12px 16px;
  border-radius:18px;
  margin-bottom:12px;
  animation:fadeIn .25s ease;
  line-height:1.35;
}
.me{
  margin-left:auto;
  background:linear-gradient(135deg,var(--primary),var(--accent));
  color:#020617;
  border-bottom-right-radius:6px;
}
.other{
  background:#1f2a44;
  border-bottom-left-radius:6px;
}
.msg small{
  display:block;
  margin-top:6px;
  font-size:11px;
  opacity:.75;
}
.chat-foot{
  display:flex;
  gap:10px;
  padding:14px;
  border-top:1px solid var(--border);
}
.chat-foot input{
  flex:1;
  padding:12px 14px;
  border-radius:14px;
  border:1px solid var(--border);
  background:transparent;
  color:var(--text);
}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1}}
</style>

<div class="chat-wrap">
  <div class="chat-head">💬 Team Chat</div>

  <div class="chat-body" id="chatBody">
    ${msgs.map(m => `
      <div class="msg ${m.u===user ? 'me':'other'}">
        ${escapeHtml(m.m)}
        <small>${m.u} • ${new Date(m.t).toLocaleTimeString()}</small>
      </div>
    `).join("")}
  </div>

  <form class="chat-foot" method="post" action="/chat" id="chatForm">
    <input name="msg" id="msgInput" placeholder="Type a message…" autocomplete="off" required>
    <button class="btn">Send</button>
  </form>
</div>

<script>
const body = document.getElementById("chatBody");
body.scrollTop = body.scrollHeight;

const input = document.getElementById("msgInput");
document.getElementById("chatForm").addEventListener("submit", ()=>{
  // allow normal submit, just UX polish
});
input.addEventListener("keydown", e=>{
  if(e.key==="Enter" && !e.shiftKey){
    e.preventDefault();
    document.getElementById("chatForm").submit();
  }
});
</script>
  `, req.session.user));
});

// POST: Send message
app.post("/chat", auth, (req, res) => {
  const list = JSON.parse(fs.readFileSync(CHAT_DB));
  list.push({
    u: req.session.user.username,
    m: req.body.msg,
    t: Date.now()
  });
  fs.writeFileSync(CHAT_DB, JSON.stringify(list.slice(-200), null, 2));
  res.redirect("/chat");
});

// helper to avoid HTML injection in chat bubbles
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

/* ================= START ================= */
app.listen(PORT, () => {
  console.log("SATYAVIJ RESTORED VERSION LIVE :", PORT);
});

/* ================= PREMIUM LOGIN ================= */
function premiumLogin(){
return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Satyavij • Secure Login</title>

<style>
:root{
--bg:#0a0f1f;
--card:rgba(17,25,54,.75);
--border:rgba(148,163,184,.18);
--primary:#7c7cff;
--accent:#6cf2c2;
--text:#e5e7eb;
--muted:#94a3b8;
}
body.light{
--bg:#f8fafc;
--card:#ffffff;
--border:rgba(15,23,42,.15);
--primary:#4f46e5;
--accent:#0ea5e9;
--text:#0f172a;
--muted:#475569;
}
*{box-sizing:border-box;transition:.25s}

body{
margin:0;
font-family:Inter,system-ui;
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
color:var(--text);
background:
radial-gradient(900px 500px at 10% -10%, #1b235a 0%, transparent 60%),
radial-gradient(700px 400px at 90% 10%, #0d5c63 0%, transparent 55%),
var(--bg);
}

.card{
width:100%;
max-width:420px;
padding:40px 38px;
border-radius:26px;
background:var(--card);
backdrop-filter:blur(16px);
border:1px solid var(--border);
box-shadow:0 40px 120px rgba(0,0,0,.6);
animation:enter .6s cubic-bezier(.22,1,.36,1);
position:relative;
}

@keyframes enter{
from{opacity:0;transform:translateY(18px) scale(.97)}
to{opacity:1;transform:none}
}

.logo{
width:72px;height:72px;
margin:auto;
border-radius:22px;
background:linear-gradient(135deg,var(--primary),var(--accent));
display:flex;
align-items:center;
justify-content:center;
font-size:32px;
font-weight:900;
color:#020617;
}

h1{
margin:22px 0 6px;
text-align:center;
font-size:26px;
}
p.sub{
text-align:center;
color:var(--muted);
margin-bottom:28px;
font-size:14px;
}

label{
font-size:13px;
color:var(--muted);
display:block;
margin-bottom:6px;
}

input{
width:100%;
padding:14px;
border-radius:14px;
border:1px solid var(--border);
background:transparent;
color:var(--text);
font-size:15px;
}
input:focus{
outline:none;
border-color:var(--primary);
box-shadow:0 0 0 4px rgba(124,124,255,.25);
}

.field{margin-bottom:16px}

.pass-wrap{position:relative}
.pass-wrap span{
position:absolute;
right:14px;
top:50%;
transform:translateY(-50%);
cursor:pointer;
font-size:14px;
color:var(--muted);
}

.btn{
margin-top:18px;
width:100%;
padding:15px;
border:none;
border-radius:16px;
cursor:pointer;
font-weight:800;
font-size:15px;
color:#020617;
background:linear-gradient(135deg,var(--primary),var(--accent));
display:flex;
align-items:center;
justify-content:center;
}

.footer{
margin-top:26px;
text-align:center;
font-size:14px;
}
.footer a{
color:var(--accent);
font-weight:700;
text-decoration:none;
}

.theme{
position:absolute;
top:18px;
right:18px;
border:1px solid var(--border);
background:transparent;
border-radius:12px;
padding:6px 10px;
cursor:pointer;
}
</style>
</head>

<body>

<div class="card">
<button class="theme" id="theme">🌙</button>

<div class="logo">S</div>

<h1>Welcome back</h1>
<p class="sub">Sign in to your secure workspace</p>

<form method="post">

<div class="field">
<label>Username</label>
<input name="u" required>
</div>

<div class="field pass-wrap">
<label>Password</label>
<input id="pass" name="p" type="password" required>
<span onclick="pass.type=pass.type==='password'?'text':'password'">👁</span>
</div>

<button class="btn">Login securely</button>
</form>

<div class="footer">
New here? <a href="/signup">Create account →</a>
</div>

</div>

<script>
const body=document.body;
const t=document.getElementById("theme");
if(localStorage.theme==="light"){body.classList.add("light");t.textContent="☀️"}
t.onclick=()=>{
body.classList.toggle("light");
localStorage.theme=body.classList.contains("light")?"light":"dark";
t.textContent=body.classList.contains("light")?"☀️":"🌙";
};
</script>

</body>
</html>
`;
}
/* ================= PREMIUM SIGNUP ================= */
function premiumSignup(){
return `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Satyavij • Create Account</title>

<style>
:root{
--bg:#0a0f1f;
--card:rgba(17,25,54,.75);
--border:rgba(148,163,184,.18);
--primary:#7c7cff;
--accent:#6cf2c2;
--text:#e5e7eb;
--muted:#94a3b8;
}
body.light{
--bg:#f8fafc;
--card:#ffffff;
--border:rgba(15,23,42,.15);
--primary:#4f46e5;
--accent:#0ea5e9;
--text:#0f172a;
--muted:#475569;
}
*{box-sizing:border-box;transition:.25s}

body{
margin:0;
font-family:Inter,system-ui;
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
color:var(--text);
background:
radial-gradient(900px 500px at 10% -10%, #1b235a 0%, transparent 60%),
radial-gradient(700px 400px at 90% 10%, #0d5c63 0%, transparent 55%),
var(--bg);
}

.card{
width:100%;
max-width:420px;
padding:40px 38px;
border-radius:26px;
background:var(--card);
backdrop-filter:blur(16px);
border:1px solid var(--border);
box-shadow:0 40px 120px rgba(0,0,0,.6);
animation:enter .6s cubic-bezier(.22,1,.36,1);
position:relative;
}

@keyframes enter{
from{opacity:0;transform:translateY(18px) scale(.97)}
to{opacity:1;transform:none}
}

.logo{
width:72px;height:72px;
margin:auto;
border-radius:22px;
background:linear-gradient(135deg,var(--primary),var(--accent));
display:flex;
align-items:center;
justify-content:center;
font-size:32px;
font-weight:900;
color:#020617;
}

h1{
margin:22px 0 6px;
text-align:center;
font-size:26px;
}
p.sub{
text-align:center;
color:var(--muted);
margin-bottom:28px;
font-size:14px;
}

label{
font-size:13px;
color:var(--muted);
display:block;
margin-bottom:6px;
}

input{
width:100%;
padding:14px;
border-radius:14px;
border:1px solid var(--border);
background:transparent;
color:var(--text);
font-size:15px;
}
input:focus{
outline:none;
border-color:var(--primary);
box-shadow:0 0 0 4px rgba(124,124,255,.25);
}

.field{margin-bottom:16px}

.pass-wrap{position:relative}
.pass-wrap span{
position:absolute;
right:14px;
top:50%;
transform:translateY(-50%);
cursor:pointer;
font-size:14px;
color:var(--muted);
}

.btn{
margin-top:18px;
width:100%;
padding:15px;
border:none;
border-radius:16px;
cursor:pointer;
font-weight:800;
font-size:15px;
color:#020617;
background:linear-gradient(135deg,var(--primary),var(--accent));
display:flex;
align-items:center;
justify-content:center;
}

.footer{
margin-top:26px;
text-align:center;
font-size:14px;
}
.footer a{
color:var(--accent);
font-weight:700;
text-decoration:none;
}

.theme{
position:absolute;
top:18px;
right:18px;
border:1px solid var(--border);
background:transparent;
border-radius:12px;
padding:6px 10px;
cursor:pointer;
}
</style>
</head>

<body>

<div class="card">
<button class="theme" id="theme">🌙</button>

<div class="logo">S</div>

<h1>Create account</h1>
<p class="sub">Start your secure workspace</p>

<form method="post">

<div class="field">
<label>Username</label>
<input name="u" required autocomplete="off">
</div>

<div class="field pass-wrap">
<label>Password</label>
<input id="pass" name="p" type="password" required>
<span onclick="pass.type=pass.type==='password'?'text':'password'">👁</span>
</div>

<button class="btn">Create account</button>
</form>

<div class="footer">
Already have an account?
<a href="/login">Login →</a>
</div>

</div>

<script>
const body=document.body;
const t=document.getElementById("theme");
if(localStorage.theme==="light"){body.classList.add("light");t.textContent="☀️"}
t.onclick=()=>{
body.classList.toggle("light");
localStorage.theme=body.classList.contains("light")?"light":"dark";
t.textContent=body.classList.contains("light")?"☀️":"🌙";
};
</script>

</body>
</html>
`;
}
