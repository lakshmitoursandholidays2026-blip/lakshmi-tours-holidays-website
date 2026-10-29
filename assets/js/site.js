import { db, configured } from "./supabase-client.js";
import { DUMMY, ph } from "./data.js";
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n) => Number(n).toLocaleString("en-IN");
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("#gallery-lightbox")?.open) {
    $("#gallery-lightbox").close();
    return;
  }
  if (event.key === "Escape" && $("#nav")?.classList.contains("open")) {
    $("#menu-close")?.click();
    $("#menu-btn")?.focus();
  }
});
const wa = (n, m) => `https://wa.me/${String(n || "").replace(/\D/g, "")}?text=${encodeURIComponent(m)}`;
const storedWhatsAppEnquirySetting = () => {
  try { return localStorage.getItem("whatsapp_enquiry_enabled"); }
  catch { return null; }
};
const parseEnquirySetting = (value) => value !== false && value !== "false";
let biz = DUMMY.business, sections = {}, whatsappEnquiryEnabled = storedWhatsAppEnquirySetting() !== "false", demo = false;
let openPackageImageId = null;
let navPlacementResizeHandler = null;
const img = (bucket, path, label) => !path ? ph(label) : /^(https?:|data:)/.test(path) ? path : db.storage.from(bucket).getPublicUrl(path).data.publicUrl;
// Database rows win. Dummy rows are used only when the table has no rows (or Supabase isn't configured).
async function get(table, q = (x) => x) {
  if (!db) { demo = true; return DUMMY[table]; }
  const { data, error } = await q(db.from(table).select("*"));
  if (error) throw error;
  if (!data.length && DUMMY[table]) { demo = true; return DUMMY[table]; }
  return data;
}
const pub = (x) => x.eq("is_published", true).order("display_order");
const retry = (el, fn) => { el.innerHTML = `<p class="state">Couldn't load this section. <button class="btn ghost" id="rt">Retry</button></p>`; $("#rt", el).onclick = fn; };

async function loadSettings() {
  if (!db) return;
  const { data, error } = await db.from("site_settings").select("*");
  if (error) throw error;
  const m = Object.fromEntries((data || []).map((r) => [r.setting_key, r.setting_value]));
  if (m.business) {
    biz = { ...DUMMY.business, ...m.business };
    if (Array.isArray(biz.phone_numbers) && biz.phone_numbers.length) biz.phone = biz.phone_numbers[0];
  }
  sections = m.sections || {};
  whatsappEnquiryEnabled = parseEnquirySetting(m.whatsapp_enquiry_enabled);
  try {
    localStorage.setItem("whatsapp_enquiry_enabled", String(whatsappEnquiryEnabled));
  }
  catch (error) { console.warn("Couldn't cache the enquiry setting for open tabs:", error); }
  biz._privacy = m.privacy?.text; biz._terms = m.terms?.text;
}
const phoneNumbers = () => {
  const numbers = Array.isArray(biz.phone_numbers) ? biz.phone_numbers : String(biz.phone || "").split(/[,;\n]+/);
  return numbers.map((number) => String(number || "").trim()).filter(Boolean);
};
const tel = (number = phoneNumbers()[0] || "") => "tel:" + String(number).replace(/[^\d+]/g, "");
const seatingCapacity = (value) => value == null || value === "" ? "" : `${value} Seater`;
const airConditioning = (vehicle) => vehicle.air_conditioning || (vehicle.has_ac == null ? null : vehicle.has_ac ? "AC" : "Non-AC");
const socialUrl = (value, hosts) => {
  try {
    const url = new URL(String(value || ""));
    const allowedHosts = Array.isArray(hosts) ? hosts : [hosts];
    return url.protocol === "https:" && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith("." + host)) ? url.href : "";
  } catch {
    return "";
  }
};
let searchCatalogPromise;
function installSiteSearch() {
  const form = $("#site-search-form"), input = $("#site-search-input"), results = $("#site-search-results");
  if (!form || !input || !results) return;
  let requestId = 0, matches = [];
  const closeResults = () => {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
  };
  const displayResults = (items) => {
    matches = items;
    results.innerHTML = items.length
      ? items.map(({ label, type, href }) => {
        const resultHref = type === "Vehicle" ? `vehicles.html?search=${encodeURIComponent(input.value.trim())}` : href;
        return `<a class="site-search-result" role="option" href="${resultHref}"><span>${esc(label)}</span><small>${type}</small></a>`;
      }).join("")
      : `<p class="site-search-empty">No matching vehicles or packages found.</p>`;
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };
  const findMatches = async () => {
    const query = input.value.trim().toLocaleLowerCase();
    const currentRequest = ++requestId;
    if (!query) { closeResults(); return; }
    try {
      searchCatalogPromise ||= Promise.all([get("vehicles", pub), get("packages", pub)]).then(([vehicles, packages]) => [
        ...vehicles.map((item) => ({ label: item.name, type: "Vehicle", href: `vehicles.html#vehicle-${encodeURIComponent(item.slug)}`, name: item.name, category: item.category })),
        ...packages.map((item) => ({ label: item.title, type: "Travel package", href: `packages.html#package-${encodeURIComponent(item.slug)}`, name: item.title }))
      ]).catch((error) => { searchCatalogPromise = null; throw error; });
      const catalog = await searchCatalogPromise;
      if (currentRequest !== requestId) return;
      const found = catalog.filter((item) =>
        String(item.name || "").toLocaleLowerCase().includes(query) ||
        String(item.category || "").toLocaleLowerCase().includes(query)
      ).slice(0, 8);
      displayResults(found);
    } catch (error) {
      console.error("Search failed to load vehicles and packages:", error);
      if (currentRequest === requestId) {
        matches = [];
        results.innerHTML = `<p class="site-search-empty">Search is temporarily unavailable. Please try again.</p>`;
        results.hidden = false;
        input.setAttribute("aria-expanded", "true");
      }
    }
  };
  input.addEventListener("input", findMatches);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (!query) return;
    await findMatches();
    if (!matches.length) return;
    const vehicleMatches = matches.filter((item) => item.type === "Vehicle");
    if (vehicleMatches.length) {
      location.href = `vehicles.html?search=${encodeURIComponent(query)}`;
      return;
    }
    location.href = matches[0].href;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeResults();
  });
}
document.addEventListener("click", (event) => {
  const form = $("#site-search-form");
  if (form && !form.contains(event.target)) {
    $("#site-search-results").hidden = true;
    $("#site-search-input").setAttribute("aria-expanded", "false");
  }
});
function layout() {
  $(".floating-contact-actions")?.remove();
  $("#floating-call-dialog")?.remove();
  document.querySelectorAll("#nav.mobile-nav-portal").forEach((nav) => nav.remove());
  const p = location.pathname.split("/").pop() || "index.html";
  const showSiteSearch = !["vehicles.html", "packages.html", "gallery.html", "contact.html", "details.html"].includes(p);
  const a = (h, t) => `<a href="${h}" ${p === h ? 'aria-current="page"' : ""}>${t}</a>`;
  const socialLinks = {
    instagram: socialUrl(biz.instagram_url, "instagram.com"),
    facebook: socialUrl(biz.facebook_url, "facebook.com"),
    youtube: socialUrl(biz.youtube_url, ["youtube.com", "youtu.be"]),
    twitter: socialUrl(biz.twitter_url, ["twitter.com", "x.com"])
  };
  $("#hdr").innerHTML = `<header><div class="wrap"><a class="logo" href="index.html">${biz.logo_path ? `<img class="site-logo-image" src="${esc(img("site-assets", biz.logo_path, biz.name))}" alt="">` : ""}<span>${esc(biz.name)}</span></a>
    <button id="menu-btn" aria-label="Open navigation menu" aria-controls="nav" aria-expanded="false">☰</button>
    <nav id="nav"><div class="mobile-nav-head"><strong>Menu</strong><button id="menu-close" type="button" aria-label="Close navigation menu">×</button></div>
    ${a("index.html", "Home")}${a("vehicles.html", "Choose Your Ride")}${a("packages.html", "Choose Your Package")}${a("gallery.html", "Our Gallery")}${a("contact.html", "Contact")}
    ${whatsappEnquiryEnabled ? `<div class="mobile-nav-actions"><a class="mobile-nav-whatsapp" target="_blank" rel="noopener" href="${wa(biz.whatsapp, "Hello " + biz.name + ", I'd like to enquire.")}">Call / WhatsApp Us</a></div>` : ""}
    <div class="mobile-nav-footer"><div class="mobile-nav-tagline"><span>EXPLORE</span><i></i><span>TRAVEL</span><i></i><span>CREATE MEMORIES</span></div>
      <svg class="mobile-nav-mountains" viewBox="0 0 420 150" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs><linearGradient id="mountain-back" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0d3d47"/><stop offset="1" stop-color="#0a303b"/></linearGradient><linearGradient id="mountain-front" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0b3540"/><stop offset="1" stop-color="#082b36"/></linearGradient></defs>
        <g fill="none" stroke="#24717a" stroke-width="2" stroke-linecap="round"><path d="M274 44q8-8 16 0q8-8 16 0"/><path d="M321 31q7-7 14 0q7-7 14 0"/><path d="M354 54q7-7 14 0q7-7 14 0"/></g>
        <path fill="url(#mountain-back)" d="M0 92 53 56l23 17 38-35 43 32 22-15 42 38 43-27 31 15 47-38 37 31 41-24v100H0z"/>
        <path fill="url(#mountain-front)" d="m0 113 42-24 30 15 44-31 35 20 37-15 40 29 44-23 36 18 43-27 34 19 35-17v73H0z"/>
        <path fill="#072833" d="m0 133 63-27 42 18 40-20 49 24 42-18 42 14 51-21 45 19 46-13v41H0z"/>
      </svg>
    </div></nav>
    <div class="actions">${whatsappEnquiryEnabled ? `<a class="btn primary" target="_blank" rel="noopener" href="${wa(biz.whatsapp, "Hello " + biz.name + ", I'd like to enquire.")}">WhatsApp Us</a>` : ""}</div></div></header>
    ${showSiteSearch ? `<div class="site-search-wrap"><form id="site-search-form" class="site-search" role="search" autocomplete="off"><label class="sr-only" for="site-search-input">Search vehicles</label><button type="submit" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8" fill="none" stroke="currentColor" stroke-width="2"/><path d="m16 16 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><input id="site-search-input" type="search" placeholder="Search vehicles" aria-controls="site-search-results" aria-expanded="false"><div id="site-search-results" class="site-search-results" role="listbox" hidden></div></form></div>` : ""}
    <button id="nav-backdrop" class="nav-backdrop" type="button" aria-label="Close navigation menu" tabindex="-1"></button>`;
  $("#ftr").innerHTML = `<footer class="site-footer">
    <div class="footer-main wrap">
      <div class="footer-brand">
        <a class="footer-brand-title" href="index.html">${biz.logo_path ? `<img class="site-logo-image" src="${esc(img("site-assets", biz.logo_path, biz.name))}" alt="">` : `<svg viewBox="0 0 56 48" aria-hidden="true"><path d="M2 42 19 13l9 14 7-11 19 26H2Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="m17 42 13-20 13 20" fill="none" stroke="#77D98C" stroke-width="4" stroke-linejoin="round"/></svg>`}<strong>${esc(biz.name)}</strong></a>
        <p>Your trusted travel partner for unforgettable journeys. Explore new destinations, experience rich cultures, and create lasting memories with us.</p>
      </div>
      <div class="footer-links">
        <h2>Quick Links</h2><a href="index.html">Home</a><a href="vehicles.html">Choose Your Ride</a><a href="packages.html">Choose Your Package</a><a href="gallery.html">Our Gallery</a><a href="contact.html">Contact</a>
      </div>
      <div class="footer-contact">
        <h2>Contact Us</h2>
        ${phoneNumbers().map((number) => `<a href="${tel(number)}"><span class="footer-contact-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 3.5 9 3l2 4.5-2.1 1.7a15 15 0 0 0 5.9 5.9l1.7-2.1 4.5 2-.5 2.4a2.5 2.5 0 0 1-2.7 2c-7.2-.7-13-6.5-13.7-13.7a2.5 2.5 0 0 1 2.5-2.2Z"/></svg></span><span>${esc(number)}</span></a>`).join("")}
        <a href="mailto:${esc(biz.email)}"><span class="footer-contact-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg></span><span>${esc(biz.email)}</span></a>
        <div><span class="footer-contact-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><span>${esc(biz.address)}</span></div>
      </div>
      <div class="footer-reach">
        <h2>Reach Us</h2>
        <p>Follow our journeys and travel updates.</p>
        <div class="footer-social-links">
          ${socialLinks.instagram ? `<a href="${esc(socialLinks.instagram)}" target="_blank" rel="noopener noreferrer" aria-label="Follow Lakshmi Tours and Holidays on Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg></a>` : ""}
          ${socialLinks.facebook ? `<a href="${esc(socialLinks.facebook)}" target="_blank" rel="noopener noreferrer" aria-label="Follow Lakshmi Tours and Holidays on Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.5 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.3V13h2.8v8h3.4Z"/></svg></a>` : ""}
          ${socialLinks.youtube ? `<a href="${esc(socialLinks.youtube)}" target="_blank" rel="noopener noreferrer" aria-label="Visit Lakshmi Tours and Holidays on YouTube"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z"/></svg></a>` : ""}
          ${socialLinks.twitter ? `<a href="${esc(socialLinks.twitter)}" target="_blank" rel="noopener noreferrer" aria-label="Follow Lakshmi Tours and Holidays on Twitter or X"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.3 4.7a9.5 9.5 0 0 1-2.7.7 4.7 4.7 0 0 0 2.1-2.6 9.4 9.4 0 0 1-3 1.1 4.7 4.7 0 0 0-8 4.3A13.3 13.3 0 0 1 2 3.3a4.7 4.7 0 0 0 1.5 6.3 4.7 4.7 0 0 1-2.1-.6v.1a4.7 4.7 0 0 0 3.8 4.6 4.7 4.7 0 0 1-2.1.1 4.7 4.7 0 0 0 4.4 3.3A9.4 9.4 0 0 1 0 19.1a13.3 13.3 0 0 0 20.5-11.2v-.6a9.5 9.5 0 0 0 2.8-2.6Z"/></svg></a>` : ""}
          ${!Object.values(socialLinks).some(Boolean) ? `<span class="footer-social-hint">Add social profile URLs in Admin → Settings.</span>` : ""}
        </div>
      </div>
    </div>
    <div class="footer-tagline"><span></span><b>EXPLORE&nbsp; • &nbsp;TRAVEL&nbsp; • &nbsp;CREATE MEMORIES</b><span></span></div>
    <svg class="footer-landscape" viewBox="0 0 1440 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g fill="none" stroke="#76aaa9" stroke-width="2" stroke-linecap="round" opacity=".75"><path d="M1080 60q9-9 18 0q9-9 18 0"/><path d="M1134 42q8-8 16 0q8-8 16 0"/><path d="M1190 72q8-8 16 0q8-8 16 0"/><path d="M1240 53q7-7 14 0q7-7 14 0"/></g>
      <path fill="#174b56" d="m0 118 112-72 65 41 80-51 96 73 93-57 70 45 115-82 98 73 97-53 82 45 115-81 93 69 94-53 120 69v156H0z"/>
      <path fill="#123f4b" d="m0 148 106-53 85 39 102-59 84 55 108-50 99 44 108-62 108 62 99-47 104 50 99-60 105 52 103-43 120 62v132H0z"/>
      <path fill="#0e3542" d="m0 177 132-53 105 43 101-52 109 57 112-49 105 47 130-58 98 52 121-47 103 51 109-57 115 54v75H0z"/>
      <g fill="#0a2c38" opacity=".95"><path d="m36 195 19-43 19 43H62v15H48v-15Zm70 0 16-37 17 37h-10v14h-13v-14Zm186 1 21-48 21 48h-13v17h-16v-17Zm94 0 15-35 16 35h-10v14h-12v-14Zm748-4 19-44 19 44h-12v16h-14v-16Zm76 0 23-52 23 52h-15v18h-16v-18Zm97 0 18-41 18 41h-11v16h-14v-16Zm81 0 21-48 21 48h-13v17h-16v-17Z"/></g>
    </svg>
    <div class="footer-bottom wrap">
      <span>© ${new Date().getFullYear()} ${esc(biz.name)}. All rights reserved.</span>
      <div class="footer-trust"><span class="trusted-label">Trusted Travel Partner</span></div>
      <span class="footer-legal"><a href="privacy.html">Privacy Policy</a><a href="terms.html">Terms</a><a class="btn ghost sm" href="admin/login.html">Admin</a></span>
    </div>
  </footer>`;
  if (p === "index.html") {
    const calls = phoneNumbers();
    document.body.insertAdjacentHTML("beforeend", `<div class="floating-contact-actions"><button class="floating-contact-button floating-call-button" id="open-call-dialog" type="button" aria-label="Choose a number to call" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l2 4.5-2.1 1.7a15 15 0 0 0 5.9 5.9l1.7-2.1 4.5 2-.5 2.4a2.5 2.5 0 0 1-2.7 2c-7.2-.7-13-6.5-13.7-13.7a2.5 2.5 0 0 1 2.5-2.2Z"/></svg></button>${whatsappEnquiryEnabled ? `<a class="floating-contact-button floating-whatsapp-button" href="${wa(biz.whatsapp, "Hello, I would like to enquire about your tour packages.")}" target="_blank" rel="noopener" aria-label="Enquire on WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 11.6a8.6 8.6 0 0 1-12.7 7.6L3 20.5l1.3-4.7a8.6 8.6 0 1 1 16.2-4.2Z"/><path d="M8.2 7.8c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.8 1.8c.1.2.1.4 0 .6l-.6.7c-.2.2-.2.4-.1.6.4.7 1.1 1.4 1.8 1.8.2.1.4.1.6-.1l.7-.7c.2-.2.4-.2.6-.1l1.8.8c.3.1.4.3.4.5 0 .3-.1.8-.5 1.1-.4.4-1 .6-1.6.5-1-.1-2.2-.7-3.4-1.8-1.3-1.2-2-2.6-2.2-3.6-.1-.8.2-1.5.6-2Z"/></svg></a>` : ""}</div><dialog class="floating-call-dialog" id="floating-call-dialog" aria-labelledby="floating-call-title"><div class="floating-call-dialog-head"><div><h2 id="floating-call-title">Contact Us</h2><p>Choose a number to call.</p></div><button class="floating-call-close" type="button" aria-label="Close contact numbers">×</button></div><div class="floating-call-number-list">${calls.length ? calls.map((number) => `<a class="floating-call-number" href="${tel(number)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 3.5 9 3l2 4.5-2.1 1.7a15 15 0 0 0 5.9 5.9l1.7-2.1 4.5 2-.5 2.4a2.5 2.5 0 0 1-2.7 2c-7.2-.7-13-6.5-13.7-13.7a2.5 2.5 0 0 1 2.5-2.2Z"/></svg><span>${esc(number)}</span><small>Call now</small></a>`).join("") : `<p class="floating-call-empty">Call contact numbers are not available.</p>`}</div></dialog>`);
    const callDialog = $("#floating-call-dialog");
    $("#open-call-dialog").onclick = () => callDialog.showModal();
    $(".floating-call-close", callDialog).onclick = () => callDialog.close();
    callDialog.addEventListener("click", (event) => {
      if (event.target === callDialog) callDialog.close();
    });
  }
  const showBack = ["vehicles.html", "packages.html", "contact.html"].includes(p);
  const pageContent = $("main .wrap");
  pageContent?.querySelector(".page-navigation")?.remove();
  if (showBack && pageContent) {
    pageContent.insertAdjacentHTML("afterbegin", `<nav class="page-navigation" aria-label="Back navigation">
      <a class="btn ghost dk" href="index.html">← Back</a>
    </nav>`);
  }
  installSiteSearch();
  const menuButton = $("#menu-btn"), nav = $("#nav"), backdrop = $("#nav-backdrop");
  const navParent = nav.parentElement;
  const closeMenu = () => {
    nav.classList.remove("open");
    backdrop.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation menu");
    document.body.classList.remove("nav-open");
  };
  const syncNavPlacement = () => {
    if (window.matchMedia("(max-width: 760px)").matches) {
      if (nav.parentElement !== document.body) document.body.append(nav);
      nav.classList.add("mobile-nav-portal");
    } else {
      if (nav.parentElement !== navParent) navParent.insertBefore(nav, menuButton.nextSibling);
      nav.classList.remove("mobile-nav-portal");
      closeMenu();
    }
  };
  if (navPlacementResizeHandler) window.removeEventListener("resize", navPlacementResizeHandler);
  navPlacementResizeHandler = syncNavPlacement;
  syncNavPlacement();
  window.addEventListener("resize", navPlacementResizeHandler);
  $("#menu-close").onclick = closeMenu;
  menuButton.onclick = () => {
    const isOpen = nav.classList.toggle("open");
    backdrop.classList.toggle("open", isOpen);
    menuButton.setAttribute("aria-expanded", String(isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
    document.body.classList.toggle("nav-open", isOpen);
  };
  backdrop.onclick = closeMenu;
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
}
const vCard = (v) => {
  const detailsUrl = esc(`details.html?t=vehicle&s=${encodeURIComponent(v.slug)}`);
  return `<article class="card" id="vehicle-${esc(v.slug)}"><a class="vehicle-details-image" href="${detailsUrl}" aria-label="View details for ${esc(v.name)}"><img loading="lazy" src="${img("vehicle-images", v.cover_image_path, v.name)}" alt="${esc(v.name)}"></a><div class="pad"><h3>${esc(v.name)}</h3>
  <p class="meta">${esc(seatingCapacity(v.max_passengers))}${airConditioning(v) ? ` · ${esc(airConditioning(v))}` : ""}</p><p>${esc(v.short_description)}</p>
  <a class="btn ghost dk" href="${detailsUrl}">View Details</a>
  ${whatsappEnquiryEnabled ? `<a class="btn primary" target="_blank" rel="noopener" href="${wa(biz.whatsapp, "Hello, I'd like to enquire about the " + v.name)}">Enquire</a>` : ""}</div></article>`;
};
const pCard = (p) => {
  const photo = img("package-images", p.cover_image_path, p.title);
  const photoLink = /^(https?:)/.test(photo) ? `\nPackage photo: ${photo}` : "";
  const enquireLink = wa(biz.whatsapp, `Hello, I'd like to enquire about the ${p.title} package.${photoLink}`);
  if (document.body.dataset.page === "home") {
    return `<article class="card home-package-card" id="package-${esc(p.slug)}"><button class="package-image-button" type="button" data-package-image="${esc(p.slug)}" aria-label="View ${esc(p.title)} image">
      <img loading="lazy" src="${esc(photo)}" alt="${esc(p.title)}"></button><div class="pad"><h3>${esc(p.title)}</h3>${whatsappEnquiryEnabled ? `<a class="btn primary" target="_blank" rel="noopener" href="${enquireLink}">Enquire</a>` : ""}</div></article>`;
  }
  return `<article class="card package-list-card" id="package-${esc(p.slug)}"><button class="package-image-button" type="button" data-package-image="${esc(p.slug)}" aria-label="View ${esc(p.title)} image">
    <img loading="lazy" src="${esc(photo)}" alt="${esc(p.title)}"></button><div class="pad"><h3>${esc(p.title)}</h3>
    ${whatsappEnquiryEnabled ? `<a class="btn primary" target="_blank" rel="noopener" href="${enquireLink}">Enquire</a>` : ""}</div></article>`;
};

function openPackageImage(packageItem) {
  let dialog = $("#package-image-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "package-image-dialog";
    dialog.className = "package-image-dialog";
    dialog.innerHTML = `<div class="package-image-head"><h2 id="package-image-title"></h2><button class="btn ghost dk sm" type="button" data-close-package-image>Close</button></div><div class="package-image-frame"><img id="package-popup-image" alt=""></div>`;
    document.body.append(dialog);
    dialog.querySelector("[data-close-package-image]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }
  openPackageImageId = packageItem.id;
  dialog.querySelector("#package-image-title").textContent = packageItem.title || "Travel package";
  const image = dialog.querySelector("#package-popup-image");
  image.src = img("package-images", packageItem.cover_image_path, packageItem.title);
  image.alt = packageItem.title || "Travel package";
  if (!dialog.open) dialog.showModal();
}
async function refreshOpenPackageImage() {
  const dialog = $("#package-image-dialog");
  if (!dialog?.open || !openPackageImageId || String(openPackageImageId).startsWith("d")) return;
  const { data, error } = await db.from("packages").select("id,title,cover_image_path").eq("id", openPackageImageId).maybeSingle();
  if (error) {
    console.error("Couldn't refresh the open package image:", error);
    return;
  }
  if (!data) {
    dialog.close();
    return;
  }
  openPackageImage(data);
}

function list(boxId, table, card) {
  const box = $(boxId); if (!box) return;
  const run = async () => {
    try {
      const rows = await get(table, pub);
      const all = rows;
      const vehicleSearch = table === "vehicles" && document.body.dataset.page === "vehicles"
        ? new URLSearchParams(location.search).get("search")?.trim()
        : "";
      const initialVehicleSearch = vehicleSearch?.toLocaleLowerCase();
      const searchInput = $("#search");
      if (vehicleSearch && searchInput) searchInput.value = vehicleSearch;
      const draw = (r) => {
        const query = $("#search")?.value.trim().toLocaleLowerCase() || "";
        if (query && query === initialVehicleSearch) {
          const categoryMatches = r.filter((item) => String(item.category || "").toLocaleLowerCase().includes(query));
          r = categoryMatches.length
            ? categoryMatches
            : r.filter((item) => String(item.name || "").toLocaleLowerCase().includes(query));
        } else if (query) r = r.filter((item) => JSON.stringify(item).toLocaleLowerCase().includes(query));
        box.innerHTML = r.length ? r.map(card).join("") : `<p class="state">Nothing matches your search.</p>`;
        if (table === "packages" && box.dataset.carouselReady === "true") {
          box.scrollLeft = 0;
          updatePackageCarouselControls(box);
        }
      };
      draw(rows);
      if (location.hash) requestAnimationFrame(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ behavior: "smooth", block: "center" }));
      if (table === "vehicles" && document.body.dataset.page === "home") box.classList.add("ride-scroller");
      if (table === "packages") {
        box.onclick = (event) => {
          const button = event.target.closest("[data-package-image]");
          if (!button) return;
          const item = all.find((packageItem) => packageItem.slug === button.dataset.packageImage);
          if (item) openPackageImage(item);
        };
        setupPackageCarousel(box);
      }
      const s = $("#search"); if (s) s.oninput = () => { const q = s.value.toLowerCase(); draw(all.filter((x) => JSON.stringify(x).toLowerCase().includes(q))); };
    } catch (e) { console.error(e); retry(box, run); }
  };
  return run();
}
function updatePackageCarouselControls(track) {
  const carousel = track.closest(".package-carousel");
  if (!carousel) return;
  const maxScroll = track.scrollWidth - track.clientWidth;
  carousel.querySelectorAll("[data-package-scroll]").forEach((button) => {
    const direction = Number(button.dataset.packageScroll);
    button.disabled = direction < 0 ? track.scrollLeft <= 1 : track.scrollLeft >= maxScroll - 1;
    button.hidden = maxScroll <= 1;
  });
}
function setupPackageCarousel(track) {
  if (document.body.dataset.page !== "home" || track.id !== "packages") return;
  const carousel = track.closest(".package-carousel");
  if (!carousel) return;
  track.dataset.carouselReady = "true";
  carousel.querySelectorAll("[data-package-scroll]").forEach((button) => {
    button.onclick = () => {
      const direction = Number(button.dataset.packageScroll);
      const card = track.querySelector(".home-package-card");
      if (!card) return;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
      const step = (card.getBoundingClientRect().width + gap) * Math.max(1, Math.floor(track.clientWidth / (card.offsetWidth + gap)));
      track.scrollBy({ left: direction * step, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    };
  });
  if (track.dataset.carouselEventsBound !== "true") {
    track.dataset.carouselEventsBound = "true";
    track.addEventListener("scroll", () => updatePackageCarouselControls(track), { passive: true });
    window.addEventListener("resize", () => updatePackageCarouselControls(track), { passive: true });
  }
  requestAnimationFrame(() => updatePackageCarouselControls(track));
}
async function hero() {
  const box = $("#hero"); if (!box) return;
  clearInterval(heroTimer);
  try {
    const rows = await get("banners", (x) => x.eq("is_active", true).order("display_order")); let i = 0;
    const btn = (t, u, c) => {
      if (!t) return "";
      const label = t.trim().toLowerCase();
      if (label === "book now") return "";
      const value = label === "choose your ride" ? "vehicles.html" : String(u || "").trim();
      const isPhone = /^\+?[\d\s().-]+$/.test(value) && /\d/.test(value);
      const href = isPhone ? `tel:${value.startsWith("+") ? "+" : ""}${value.replace(/\D/g, "")}` : value || (label === "call now" ? `tel:${String(biz.phone).replace(/[^\d+]/g, "")}` : "");
      if (label.includes("enquir")) {
        return whatsappEnquiryEnabled ? `<a class="btn ${c}" target="_blank" rel="noopener" href="${wa(biz.whatsapp, "Hello " + biz.name + ", I'd like to enquire.")}">${esc(t)}</a>` : "";
      }
      if (!whatsappEnquiryEnabled && (label.includes("whatsapp") || /^https?:\/\/(wa\.me|(?:api|web)\.whatsapp\.com)\//i.test(href))) return "";
      return href ? `<a class="btn ${c}" href="${esc(href)}">${esc(t)}</a>` : "";
    };
    box.onclick = (event) => {
      const dot = event.target.closest("[data-hero-slide]");
      if (!dot) return;
      i = Number(dot.dataset.heroSlide);
      show();
    };
    const show = () => {
      const b = rows[i % rows.length], o = b.overlay_opacity ?? 0.45;
      const src = window.innerWidth < 700 && b.mobile_image_path ? b.mobile_image_path : b.desktop_image_path;
      box.style.backgroundImage = `linear-gradient(rgba(11,31,42,${o}),rgba(11,31,42,${o})),url("${img("site-assets", src, "")}")`;
      box.innerHTML = `<div class="wrap hero-in">${b.eyebrow_text ? `<p class="eyebrow">${esc(b.eyebrow_text)}</p>` : ""}
        ${b.title ? `<h1>${esc(b.title)} ${b.title_highlight ? `<span class="hl">${esc(b.title_highlight)}</span>` : ""}</h1>` : ""}${b.description ? `<p class="lead">${esc(b.description)}</p>` : ""}
        <div class="row">${btn(b.primary_button_text, b.primary_button_url, "primary")}${btn(b.secondary_button_text, b.secondary_button_url, "ghost")}</div></div>
        ${rows.length > 1 ? `<div class="hero-dots" role="group" aria-label="Choose banner">${rows.map((_, index) => `<button type="button" data-hero-slide="${index}" aria-label="Show banner ${index + 1}" aria-pressed="${index === i}" class="${index === i ? "active" : ""}"></button>`).join("")}</div>` : ""}`;
    };
    show(); if (rows.length > 1) heroTimer = setInterval(() => { i = (i + 1) % rows.length; show(); }, 6000);
  } catch (e) { console.error(e); retry(box, hero); }
}
async function detail() {
  const box = $("#detail"); if (!box) return;
  const q = new URLSearchParams(location.search), t = q.get("t") === "vehicle" ? "vehicle" : "package", slug = q.get("s");
  const table = t + "s";
  try {
    let rows = await get(table, (x) => x.eq("slug", slug || "").eq("is_published", true));
    const it = rows.find((r) => r.slug === slug) || (!db || demo ? null : rows[0]);
    if (!it) { box.innerHTML = `<p class="state">We couldn't find that item. <a href="${table}.html">Back to all</a></p>`; return; }
    const title = it.title || it.name;
    let gallery = [], itin = it.itinerary || [];
    if (db && it.id && !String(it.id).startsWith("d")) {
      const g = await db.from(t + "_images").select("*").eq(t + "_id", it.id).order("display_order");
      if (g.error) throw g.error;
      gallery = g.data || [];
      if (t === "package") { const r = await db.from("package_itinerary").select("*").eq("package_id", it.id).order("day_number"); itin = r.data || []; }
    }
    const bucket = t + "-images", ul = (a) => (a?.length ? `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
    const gal = (gallery.length ? gallery : []).map((g, index) => `<figure class="gallery-photo"><button class="gallery-photo-open" type="button" data-gallery-photo="${esc(g.id || index)}" aria-label="Open photo ${index + 1} of ${gallery.length}"><img loading="lazy" src="${esc(img(bucket, g.image_path))}" alt="${esc(g.alt_text || title)}"></button></figure>`).join("");
    const msg = `Hello, I'd like to enquire about ${title}`;
    const specs = t === "vehicle" ? [
      ["Vehicle type", it.category],
      ["Seating capacity", seatingCapacity(it.max_passengers) || null],
      ["Air conditioning", airConditioning(it)],
      ["Luggage capacity", it.luggage_capacity],
      ...(Array.isArray(it.details) ? it.details.filter((item) => item && typeof item === "object").map((item) => [item.label, item.value]) : []),
      ...Object.entries(it.specifications || {}).map(([label, value]) => [label, value])
    ].filter(([, value]) => value != null && String(value).trim() !== "") : [];
    const packageInfo = t === "package" ? `<p class="meta">${esc(it.destination)} &middot; ${it.duration_days} Days / ${it.duration_nights} Nights &middot; <b class="price">&#8377;${num(it.price)}</b> ${esc(it.price_unit)}</p>
      <div class="two"><div><h2>Included</h2>${ul(it.inclusions)}</div><div><h2>Excluded</h2>${ul(it.exclusions)}</div></div>
      ${it.terms_and_conditions ? `<h2>Terms</h2><p>${esc(it.terms_and_conditions)}</p>` : ""}${it.cancellation_policy ? `<h2>Cancellation policy</h2><p>${esc(it.cancellation_policy)}</p>` : ""}` : "";
    box.innerHTML = `<nav class="page-navigation" aria-label="Back navigation"><a class="btn ghost dk" href="index.html">← Back</a></nav>
      <img class="cover" src="${img(bucket, it.cover_image_path, title)}" alt="${esc(title)}"><h1 class="dk">${esc(title)}</h1>
      ${packageInfo}
      ${gal ? `<div class="gallery detail-gallery">${gal}</div>` : ""}
      ${t === "vehicle" ? `<h2>Details</h2><dl class="vehicle-specifications">${specs.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>` : `<p>${esc(it.full_description || it.short_description || "")}</p>`}
      ${itin.length ? `<h2>Itinerary</h2>${itin.map((d) => `<div class="day"><b>Day ${d.day_number}: ${esc(d.title)}</b><p>${esc(d.description)}</p></div>`).join("")}` : ""}
      ${whatsappEnquiryEnabled ? `<a class="btn primary" target="_blank" rel="noopener" href="${wa(biz.whatsapp, msg)}">Enquire</a>` : ""}`;
  } catch (e) { console.error(e); retry(box, detail); }
}
async function refreshDetail() {
  await detail();
}
function contact() {
  const m = $("#map"); if (m) m.src = "https://www.google.com/maps?q=" + encodeURIComponent(biz.map_query || biz.address) + "&output=embed";
  const info = $("#cinfo");
  if (info) info.innerHTML = `<p><strong>${esc(biz.name)}</strong></p>${phoneNumbers().map((number) => `<p>📞 <a href="${tel(number)}">${esc(number)}</a></p>`).join("")}<p>✉️ <a href="mailto:${esc(biz.email)}">${esc(biz.email)}</a></p><p>📍 ${esc(biz.address)}</p><p>🕘 <span class="business-hours">${esc(biz.hours)}</span></p>`;
}
function legal() { const b = $("#legal"); if (!b) return; const t = (b.dataset.k === "terms" ? biz._terms : biz._privacy) || "Sample text. Replace this in Admin → Settings."; b.innerHTML = t.split(/\n+/).map((x) => `<p>${esc(x)}</p>`).join(""); }

async function loadGallery() {
  const containers = [$("#home-gallery"), $("#gallery-page-grid")].filter(Boolean);
  if (!containers.length) return;
  try {
    const { data, error } = db
      ? await db.from("gallery_photos").select("id,image_path,alt_text,created_at").order("created_at", { ascending: false })
      : { data: [], error: null };
    if (error) throw error;
    for (const container of containers) {
      container.innerHTML = data?.length
        ? data.map((photo) => {
          const description = String(photo.alt_text || "").trim();
          return `<figure class="gallery-photo"><button class="gallery-photo-open" type="button" data-gallery-photo="${esc(photo.id)}" aria-label="${description ? `Open photo: ${esc(description)}` : "Open gallery photo"}"><img loading="lazy" src="${esc(db.storage.from("gallery-images").getPublicUrl(photo.image_path).data.publicUrl)}" alt="${esc(description)}"></button>${description ? `<figcaption>${esc(description)}</figcaption>` : ""}</figure>`;
        }).join("")
        : "";
    }
    setupHomeGalleryAutoplay();
  } catch (error) {
    console.error("Couldn't load gallery photos:", error);
    for (const container of containers) {
      container.innerHTML = `<p class="state">Couldn't load gallery photos. <button class="btn ghost dk sm" type="button" data-gallery-retry>Retry</button></p>`;
    }
    stopHomeGalleryAutoplay();
  }
}
let homeGalleryFrame = 0;
let homeGalleryLastFrame = 0;
let homeGalleryCycleWidth = 0;
let homeGalleryLightboxOpen = false;
let homeGalleryResizeTimer = 0;
function stopHomeGalleryAutoplay() {
  if (homeGalleryFrame) cancelAnimationFrame(homeGalleryFrame);
  homeGalleryFrame = 0;
  homeGalleryLastFrame = 0;
  $("#home-gallery")?.classList.remove("is-autoplaying");
}
function updateHomeGalleryAutoplay() {
  const track = $("#home-gallery");
  if (!track || !homeGalleryCycleWidth || homeGalleryLightboxOpen) {
    stopHomeGalleryAutoplay();
    return;
  }
  if (homeGalleryFrame) return;
  track.classList.add("is-autoplaying");
  const move = (timestamp) => {
    if (homeGalleryLightboxOpen || !track.isConnected) {
      stopHomeGalleryAutoplay();
      return;
    }
    if (homeGalleryLastFrame) {
      track.scrollLeft += Math.min(timestamp - homeGalleryLastFrame, 50) * 0.05;
      if (track.scrollLeft >= homeGalleryCycleWidth) {
        track.scrollLeft %= homeGalleryCycleWidth;
      }
    }
    homeGalleryLastFrame = timestamp;
    homeGalleryFrame = requestAnimationFrame(move);
  };
  homeGalleryFrame = requestAnimationFrame(move);
}
function setupHomeGalleryAutoplay() {
  const track = $("#home-gallery");
  if (!track) return;
  const previousOffset = track.scrollLeft;
  stopHomeGalleryAutoplay();
  track.querySelectorAll("[data-gallery-clone]").forEach((clone) => clone.remove());
  const photos = [...track.querySelectorAll(":scope > .gallery-photo")];
  if (!photos.length) {
    homeGalleryCycleWidth = 0;
    updateHomeGalleryAutoplay();
    return;
  }
  const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
  homeGalleryCycleWidth = photos.reduce((width, photo) => width + photo.getBoundingClientRect().width, 0) + gap * photos.length;
  if (!homeGalleryCycleWidth) {
    updateHomeGalleryAutoplay();
    return;
  }
  const copies = Math.ceil(track.clientWidth / homeGalleryCycleWidth) + 1;
  for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
    for (const photo of photos) {
      const clone = photo.cloneNode(true);
      clone.dataset.galleryClone = "true";
      clone.setAttribute("aria-hidden", "true");
      clone.inert = true;
      track.append(clone);
    }
  }
  track.scrollLeft = previousOffset % homeGalleryCycleWidth;
  updateHomeGalleryAutoplay();
}
window.addEventListener("resize", () => {
  window.clearTimeout(homeGalleryResizeTimer);
  homeGalleryResizeTimer = window.setTimeout(setupHomeGalleryAutoplay, 120);
});
function openGalleryPhoto(photo) {
  const image = photo.querySelector("img");
  if (!image) return;
  let dialog = $("#gallery-lightbox");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "gallery-lightbox";
    dialog.className = "gallery-lightbox";
    dialog.setAttribute("aria-label", "Gallery photo");
    dialog.innerHTML = `<button class="gallery-lightbox-close" type="button" aria-label="Close photo">×</button><img class="gallery-lightbox-image" alt=""><p class="gallery-lightbox-caption" hidden></p>`;
    document.body.append(dialog);
    dialog.querySelector(".gallery-lightbox-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      dialog.close();
    });
    dialog.addEventListener("close", () => {
      homeGalleryLightboxOpen = false;
      updateHomeGalleryAutoplay();
    });
  }
  const largeImage = dialog.querySelector(".gallery-lightbox-image");
  const caption = dialog.querySelector(".gallery-lightbox-caption");
  largeImage.src = image.src;
  largeImage.alt = image.alt;
  caption.textContent = photo.closest(".gallery-photo").querySelector("figcaption")?.textContent || "";
  caption.hidden = !caption.textContent;
  homeGalleryLightboxOpen = true;
  updateHomeGalleryAutoplay();
  if (!dialog.open) dialog.showModal();
}
document.addEventListener("click", (event) => {
  const photoButton = event.target.closest?.("[data-gallery-photo]");
  if (photoButton) {
    openGalleryPhoto(photoButton);
    return;
  }
  const retryButton = event.target.closest?.("[data-gallery-retry]");
  if (retryButton) {
    loadGallery();
    return;
  }
  const scrollButton = event.target.closest?.("[data-gallery-scroll]");
  const track = $("#home-gallery");
  if (!scrollButton || !track) return;
  const firstPhoto = track.querySelector(":scope > .gallery-photo");
  if (!firstPhoto) return;
  const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
  const left = Number(scrollButton.dataset.galleryScroll) * (firstPhoto.getBoundingClientRect().width + gap);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) track.scrollBy({ left });
  else track.scrollBy({ left, behavior: "smooth" });
});

let heroTimer = null;
let siteRealtimeChannel = null;
const pendingSiteRefreshes = new Set();
let siteRefreshScheduled = false;
let siteRefreshRunning = false;
const refreshSiteTables = async (tables) => {
  if (tables.has("gallery_photos")) await loadGallery();
  if (tables.has("site_settings")) {
    const searchQuery = $("#site-search-input")?.value || "";
    await loadSettings();
    layout();
    const searchInput = $("#site-search-input");
    if (searchInput) searchInput.value = searchQuery;
    for (const [key, enabled] of Object.entries(sections)) {
      const section = $(`[data-section="${key}"]`);
      if (section) section.hidden = enabled === false;
    }
    contact();
    legal();
    hero();
    await list("#vehicles", "vehicles", vCard);
    await list("#packages", "packages", pCard);
    await refreshOpenPackageImage();
    await refreshDetail();
    if (searchQuery) searchInput?.dispatchEvent(new Event("input"));
    return;
  }
  if (tables.has("banners")) hero();
  if (["vehicles", "vehicle_images"].some((table) => tables.has(table))) {
    searchCatalogPromise = null;
    if ($("#site-search-input")?.value.trim()) $("#site-search-input").dispatchEvent(new Event("input"));
    await list("#vehicles", "vehicles", vCard);
    if (new URLSearchParams(location.search).get("t") === "vehicle") await refreshDetail();
  }
  if (["packages", "package_images", "package_itinerary"].some((table) => tables.has(table))) {
    searchCatalogPromise = null;
    if ($("#site-search-input")?.value.trim()) $("#site-search-input").dispatchEvent(new Event("input"));
    await list("#packages", "packages", pCard);
    await refreshOpenPackageImage();
    if (new URLSearchParams(location.search).get("t") === "package") await refreshDetail();
  }
};
const applyWhatsAppEnquirySetting = async (enabled) => {
  if (whatsappEnquiryEnabled === enabled) return;
  const searchQuery = $("#site-search-input")?.value || "";
  whatsappEnquiryEnabled = enabled;
  try {
    localStorage.setItem("whatsapp_enquiry_enabled", String(enabled));
  }
  catch (error) { console.warn("Couldn't cache the enquiry setting for open tabs:", error); }
  layout();
  hero();
  await list("#vehicles", "vehicles", vCard);
  await list("#packages", "packages", pCard);
  await refreshDetail();
  if (searchQuery) {
    const searchInput = $("#site-search-input");
    if (searchInput) {
      searchInput.value = searchQuery;
      searchInput.dispatchEvent(new Event("input"));
    }
  }
};
window.addEventListener("storage", (event) => {
  if (event.key === "whatsapp_enquiry_enabled" && (event.newValue === "true" || event.newValue === "false")) {
    applyWhatsAppEnquirySetting(event.newValue === "true").catch((error) => console.error("Couldn't apply the WhatsApp enquiry setting from another tab:", error));
  }
});
let whatsappEnquiryPollInFlight = false;
const syncWhatsAppEnquirySetting = async () => {
  if (!db || whatsappEnquiryPollInFlight) return;
  whatsappEnquiryPollInFlight = true;
  try {
    const { data, error } = await db.from("site_settings").select("setting_value").eq("setting_key", "whatsapp_enquiry_enabled").maybeSingle();
    if (error) throw error;
    await applyWhatsAppEnquirySetting(parseEnquirySetting(data?.setting_value));
  } catch (error) {
    console.error("Couldn't sync the WhatsApp enquiry setting:", error);
  } finally {
    whatsappEnquiryPollInFlight = false;
  }
};
const queueSiteRefresh = (table) => {
  pendingSiteRefreshes.add(table);
  if (siteRefreshScheduled || siteRefreshRunning) return;
  siteRefreshScheduled = true;
  queueMicrotask(async () => {
    siteRefreshScheduled = false;
    siteRefreshRunning = true;
    while (pendingSiteRefreshes.size) {
      const tables = new Set(pendingSiteRefreshes);
      pendingSiteRefreshes.clear();
      try {
        await refreshSiteTables(tables);
      } catch (error) {
        console.error("Couldn't apply live website updates:", error);
      }
    }
    siteRefreshRunning = false;
    if (pendingSiteRefreshes.size) queueSiteRefresh(pendingSiteRefreshes.values().next().value);
  });
};
const startSiteRealtime = () => {
  if (!db || siteRealtimeChannel) return;
  const liveTables = ["banners", "vehicles", "vehicle_images", "packages", "package_images", "package_itinerary", "gallery_photos", "site_settings"];
  siteRealtimeChannel = db.channel("public-site-live");
  siteRealtimeChannel.on("postgres_changes", { event: "*", schema: "public", table: "site_change_events" }, (payload) => {
    const table = payload.new?.table_name || payload.old?.table_name;
    if (liveTables.includes(table)) queueSiteRefresh(table);
  });
  siteRealtimeChannel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      for (const table of liveTables) queueSiteRefresh(table);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.error("Public website Realtime subscription status:", status);
    }
  });
};

const renderPublicPage = () => {
  const searchQuery = $("#site-search-input")?.value || "";
  layout();
  document.querySelectorAll(".floating-whatsapp-button").forEach((button) => button.remove());
  for (const section of document.querySelectorAll("[data-section]")) {
    const key = section.dataset.section;
    if (Object.prototype.hasOwnProperty.call(sections, key)) section.hidden = sections[key] === false;
  }
  hero();
  list("#vehicles", "vehicles", vCard);
  list("#packages", "packages", pCard);
  detail();
  contact();
  legal();
  const searchInput = $("#site-search-input");
  if (searchInput && searchQuery) {
    searchInput.value = searchQuery;
    searchInput.dispatchEvent(new Event("input"));
  }
};
renderPublicPage();
loadGallery();
if (db) {
  loadSettings().then(renderPublicPage).catch((error) => {
    console.error("Couldn't load website settings; showing the default website content:", error);
  });
}
if (demo || !configured) document.body.insertAdjacentHTML("afterbegin", `<div class="demo">Sample content is shown. It is replaced automatically as you add real data in the admin.</div>`);
startSiteRealtime();
window.setInterval(() => {
  if (document.visibilityState === "visible") syncWhatsAppEnquirySetting();
}, 5000);
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistration("/service-worker.js").then(async (registration) => {
    if (!registration) return;
    const subscription = await registration.pushManager?.getSubscription();
    if (subscription && !(await subscription.unsubscribe())) {
      throw new Error("The browser could not remove its legacy push subscription.");
    }
    if (!(await registration.unregister())) {
      throw new Error("The browser could not remove the legacy service worker.");
    }
  }).catch((error) => console.error("Couldn't remove the legacy push service worker:", error));
}
