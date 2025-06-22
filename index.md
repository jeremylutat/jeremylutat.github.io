---
layout: single
author_profile: true
title: "Jeremy Lutat Portfolio"
header:
  overlay_color: "#000"
  overlay_filter: "0.2"
  caption:
excerpt: "Retail expert pivoting into brand and analytics. This portfolio showcases my data-driven approach to marketing and business insight."
classes:wide
---

## 🔍 Featured Case Studies

{% for item in site.case_studies %}
  {% include archive-single.html %}
{% endfor %}

---

## 📰 Recent Blog Posts

{% for post in site.posts limit:3 %}
  {% include archive-single.html %}
{% endfor %}