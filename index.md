---
layout: single
title: "Jeremy Lutat Portfolio"
author_profile: true
classes: wide
---

Welcome! I’m Jeremy Lutat — a strategic problem solver with a background in product development and sourcing, now pivoting toward the analytical and customer-facing side of brand and marketing strategy.

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