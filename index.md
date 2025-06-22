---
layout: single
title: "Jeremy Lutat Portfolio"
author_profile: true
sidebar:
  nav: "main"
---

## 🔍 Featured Case Studies

{% for item in site.case-studies %}
  {% include archive-single.html %}
{% endfor %}

---

## 📰 Recent Blog Posts

{% for post in site.posts limit:3 %}
  {% include archive-single.html %}
{% endfor %}