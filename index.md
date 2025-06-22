---
layout: home
author_profile: true
title: "Jeremy Lutat Portfolio"
header:
  overlay_color: "#000"
  overlay_filter: "0.2"
  caption:
excerpt: "Retail expert pivoting into brand and analytics. This portfolio showcases my data-driven approach to marketing and business insight."

---

## 🔍 Featured Case Studies

{% for item in site._case_studies %}
  {% include archive-single.html %}
{% endfor %}

---

## 📰 Recent Blog Posts

{% for post in site._posts limit:3 %}
  {% include archive-single.html %}
{% endfor %}