---
layout: single
title: Welcome to my portfolio & blog!
author_profile: true
author: jeremy
sidebar:
  nav: "main"
---

## 🔍 Featured Case Studies

{% for post in site.case_studies limit:3 %}
  {% include archive-single.html %}
{% endfor %}

---

## 📰 Recent Blog Posts

{% for post in site.posts limit:3 %}
  {% include archive-single.html %}
{% endfor %}