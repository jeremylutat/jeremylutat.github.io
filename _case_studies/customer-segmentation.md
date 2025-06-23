---
layout: single
title: "Customer Segmentation & Brand Opportunity"
permalink: /case-studies/customer-segmentation/
author: jeremy
sidebar:
  nav: "main"
---
# Customer Segmentation & Brand Opportunity Forecasting

## 📋 Business Task  
A national e-commerce retailer wants to understand which customer segments drive the most revenue, how their behavior differs, and where untapped growth opportunities lie. This project identifies high-value segments and prescribes targeted marketing tactics to maximize ROI.

## 🗄️ Data Sources  
- **TheLook E-Commerce Dataset** (BigQuery public dataset)  
  - Customers, orders, order_items, products  
- **Synthetic Campaign Logs** (in-house mock data)  
  - Purchase timestamps, referral sources  

## 🛠️ Methodology  
1. **Data Preparation**  
   - Joined `orders` to `order_items` and `users` to build a full purchase history per customer.  
   - Filtered out one-time buyers and test accounts.  
2. **Segmentation via RFM Analysis**  
   - Calculated Recency, Frequency, and Monetary value for each customer.  
   - K-means clustering in R to group customers into 4 segments.  
3. **Visualization & Dashboarding**  
   - Built interactive R Shiny prototypes to explore segment characteristics.  
   - Designed Tableau dashboards highlighting segment performance and demographic breakdowns.

## 📊 Key Findings  
- **Top 20% of customers (“Champions”)** account for 55% of total revenue; they order 3× as often as the median.  
- **Frequent browsers (“Browsers”)** have high cart additions but 30% lower conversion rates—an opportunity for targeted promotions.  
- **At-risk customers** (purchased >90 days ago) show a 15% drop-off in average order value, but responded 25% better to email incentives.

## 💡 Recommendations  
- **Loyalty Program Expansion**: Introduce tiered rewards for “Champions” to increase order frequency by 10%.  
- **Cart-Abandonment Campaigns**: Automate 48-hour email reminders with a 5% promo code for “Browsers.”  
- **Win-Back Flow**: Trigger a “We miss you” SMS to at-risk segments with personalized product suggestions.

## 🔮 Next Steps  
- A/B test different incentive levels on the “Browsers” segment to optimize promo spend.  
- Integrate demographic data to refine cluster definitions and personalize messaging further.  
- Monitor segment migrations monthly and update cluster centroids to capture evolving behavior.

---

_Add any charts, SQL snippets, or dashboard embeds below each section to illustrate your process and results._
