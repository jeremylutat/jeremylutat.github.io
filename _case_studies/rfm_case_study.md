---
title: "Customer Segmentation RFM Case Study"
date: 2025-07-07
permalink: /case-studies/rfm-customer-segmentation/
sidebar:
  nav: "main"
classes: wide
categories:
  - case-study
  - rfm
  - customer-analytics
tags:
  - RFM
  - segmentation
  - retention
  - tableau
assets: /assets/rfm_case_study
---

# Introduction

In this case study, we'll perform a **Recency-Frequency-Monetary (RFM)** analysis on an e-commerce company's customer transaction data. The goal is to segment customers based on their purchase behavior over three consecutive one-year periods (July,2022–June,2023, July,2023–June,2024, and July,2024–June,2025). By comparing RFM segments across these time windows, we aim to uncover issues and opportunities in segment performance, identify new and loyal customers, flag at-risk or lost customers, and analyze segment migration over time. This will help the business tailor marketing strategies to different customer groups (e.g. rewarding champions, re-engaging at-risk customers, and retaining new customers).

**RFM Segmentation** is a classic marketing technique that evaluates customers by:
- **Recency (R):** How recently a customer made a purchase (customers who purchased more recently are often more engaged).
- **Frequency (F):** How often a customer makes purchases (more frequent buyers are typically more loyal).
- **Monetary (M):** How much a customer has spent (higher spending indicates greater value).

Each customer is scored on R, F, and M to create an overall segment. We will assign RFM scores and consistent segment labels in each time window, then examine how customers move between segments from year to year using migration tables and a Sankey diagram for visualization using Tableau Public, in addition to creating several visualizations using `ggpplot2()` within R Studio.

# Data Overview and Preparation

The original data is sourced from 'thelook_ecommerce' fictional retail data set, available in BigQuery's public data sets. This was briefly cleaned and manipulated using SQL in BigQuery before being exported for further manipulation in R Studio's desktop application. The majority of work was done utlizing R (as follows). We have several data sets provided as CSV files, containing cleaned transaction and customer information:

- **Transactions:** Detailed order line records (order date, status, product, price, cost, profit, etc.) for all purchases and returns from 2019 through mid-2025.
- **Customers:** Customer demographics and acquisition channel (e.g. age, gender, country, traffic source).
- **Inventory/Products:** Product catalog details (product names, categories, retail price, cost, distribution center info).
- **Events:** Website session events (e.g. cart additions), not directly used in RFM but available for context.
- **DC List:** Names and geo locations of distribution centers.

First, we load the necessary packages and data into R. We will use **tidyverse** for data manipulation and **lubridate** for date handling.

```{r 01-setup, echo=TRUE, include=TRUE, message=TRUE, warning=FALSE}
library(tidyverse)
library(lubridate)
library(dplyr)
library(knitr)
library(purrr)
library(ggplot2)
library(scales)

transactions <- read_csv("transactions_cleaned.csv")
customers    <- read_csv("customer_metadata_cleaned.csv")
```
*(For brevity, no need to load 'inventory_cleaned.csv', 'events_cleaned.csv', 'dc_list_cleaned.csv', as they are not directly needed for the RFM analysis.)* 

Let's inspect the transactions data structure:

```{r 02-preview-transactions, echo=TRUE, include=TRUE}
glimpse(transactions)
head(transactions, 5)
```

Each transaction record represents **one item in an order**. Key fields include:

-  `user_id`: Customer identifier.
-  `order_id`: Order identifier (an order can have multiple items/rows).
-  `order_date`: Date/time of purchase.
-  `order_status`: "Complete" for fulfilled orders or "Returned" if the item was returned.
-  `is_returned`: Logical flag for returns.
-  `sale_price`: The price paid by the customer for that item (after any discounts).
-  `cost` and `profit`: Item cost and profit. `net_profit` is profit adjusted for returns (returns have `net_profit = 0`).
-  `traffic_source`: Organic, Facebook, Search, etc - where customer traffic originated.

**Return & Discount Handling:** We ensure that returns and discounts are properly accounted for in the RFM calculations:

- We will **exclude returned items** from the analysis so that they do not count toward purchase frequency or monetary value. (If an order item was returned, `is_returned = TRUE` and `net_profit = 0`; we treat this as if the purchase did not contribute to customer value.)
- By using `sale_price` (the actual amount paid) for Monetary calculations, we inherently account for any discounts applied (since `sale_price` is net of discounts, whereas `retail` is the full price). Thus, Monetary value represents the **actual** revenue from the customer, not the list price.

Next, we define the three time windows for segmentation. Based on the data and business context, we use fiscal year periods running from July 1 to June 30 (ideally, this would have been Jan 1- Dec 31, but the latest transaction is in June 25, and I wanted to make use of the most recent data.):

- **FY2023**: July 1, 2022 – June 30, 2023
- **FY2024**: July 1, 2023 – June 30, 2024
- **FY2025**: July 1, 2024 – June 30, 2025

We'll start by Joining the "customers" and "transactions" tables to update the latter to include `traffic_source`.
```{r 03-join-customers, echo=TRUE, include=TRUE}
transactions <- transactions %>%
  left_join(
    customers %>% select(user_id, traffic_source),
    by = "user_id"
  )
```

We'll filter transactions into the RFM windows (considering only completed purchases, not returns) and compute RFM metrics for each customer per window.

```{r 04-define-windows, echo=TRUE, include=TRUE}
# Make sure your order date column is Date class
transactions <- transactions %>%
  mutate(order_date = as_date(order_date))

# Window 1: July 1 2022 – June 30 2023
transactions_w1 <- transactions %>%
  filter(order_date >= as.Date("2022-07-01") &
         order_date <= as.Date("2023-06-30") &
         is_returned == FALSE)

# Window 2: July 1 2023 – June 30 2024
transactions_w2 <- transactions %>%
  filter(order_date >= as.Date("2023-07-01") &
         order_date <= as.Date("2024-06-30") &
         is_returned == FALSE)

# Window 3: July 1 2024 – June 30 2025
transactions_w3 <- transactions %>%
  filter(order_date >= as.Date("2024-07-01") &
         order_date <= as.Date("2025-06-30") &
         is_returned == FALSE)

# Sanity-checks
cat(
  "W1 rows:", nrow(transactions_w1), "  users:", n_distinct(transactions_w1$user_id), "\n",
  "W2 rows:", nrow(transactions_w2), "  users:", n_distinct(transactions_w2$user_id), "\n",
  "W3 rows:", nrow(transactions_w3), "  users:", n_distinct(transactions_w3$user_id), "\n"
)
```
*(The above code prints the number of transactions and unique customers in each period for verification.)*

# RFM Calculation by Period

Now calculate Recency, Frequency, and Monetary values for each customer in each period:

- **Recency**: For each customer, we find the date of their most recent purchase in that window, and compute the number of days from that purchase to the end of the window. A smaller number means the customer purchased more recently in that period.
- **Frequency**: The number of distinct orders the customer placed in that period. We count unique `order_id` per user. (Multiple items in one order count as one purchase event.)
- **Monetary**: The total spending by the customer in that period, calculated as the sum of `sale_price` for all their purchases (returns excluded as filtered). This represents the revenue contributed by the customer.

We'll use **dplyr** to group transactions by user and compute these metrics for each period.
```{r 05-rfm-metrics, echo=TRUE, include=TRUE}
rfm_w1 <- transactions_w1 %>%
  group_by(user_id, traffic_source) %>%
  summarise(
    Recency_days = as.numeric(difftime(as.Date("2023-06-30"), max(order_date), units="days")),
    Frequency    = n_distinct(order_id),
    Monetary     = sum(sale_price, na.rm = TRUE),
    .groups      = 'drop'
  )
# Inspect first few rows
head(rfm_w1)

rfm_w2 <- transactions_w2 %>%
  group_by(user_id, traffic_source) %>%
  summarise(
    Recency_days = as.numeric(difftime(as.Date("2024-06-30"), max(order_date), units="days")),
    Frequency    = n_distinct(order_id),
    Monetary     = sum(sale_price, na.rm = TRUE),
    .groups      = 'drop'
  )
head(rfm_w2)

rfm_w3 <- transactions_w3 %>%
  group_by(user_id, traffic_source) %>%
  summarise(
    Recency_days = as.numeric(difftime(as.Date("2025-06-30"), max(order_date), units="days")),
    Frequency    = n_distinct(order_id),
    Monetary     = sum(sale_price, na.rm = TRUE),
    .groups      = 'drop'
  )
head(rfm_w3)
```

At this stage, we have three tables ('rfm_w1, 'rfm_w2', 'rfm_w3'), each with one row per customer active in that period, and columns for `Recency_days`, `Frequency`, and `Monetary`. 

**Example interpretation**: If a customer `user_id = 12345` appears in 'rfm_w2' with `Recency_days = 45`, `Frequency = 2`, `Monetary = 150`, it means this customer’s last purchase in Jul 2023–Jun 2024 was 45 days before June 30, 2024 (around mid-May 2024), they placed 2 orders in that year, spending a total of $150.

# Scoring and Segment Assignment

Before we assign segments, we first flag **First-Time Buyers**, those whose _first-ever_ purchase date falls within the fiscal window, so that only true newcomers ever receive that label. All subsequent segments are applied only after removing First-Time Buyers from the remaining pool.

Next, we convert the raw RFM metrics into **RFM scores** (1–5 scale) and assign each remaining customer a segment label. We use identical scoring logic across FY2023, FY2024, and FY2025 to ensure comparability.

**Scoring methodology:**

- **Recency Score (R_score):**  
  Rank _Recency_days_ within the period in descending order (most recent = highest score). We use quintiles so that the top 20% most recent purchases get R_score = 5, the next 20% get R_score = 4, and so on down to 1.
- **Frequency Score (F_score):**  
  Assign based on number of orders in the window:  
  - F_score = 5 if Frequency ≥ 3 (very frequent)  
  - F_score = 4 if Frequency = 2 (moderately frequent)  
  - F_score = 1 if Frequency = 1 (infrequent)  
- **Monetary Score (M_score):**  
  Rank total spend in the window into quintiles—top 20% of spenders get M_score = 5, next 20% get 4, down to 1 for the lowest 20%.

Once R, F, M are scored, we assign segments in this order of priority:

- **First-Time Buyers**  
  Customers whose _first-ever_ purchase date is within the window (R/F/M scores not used).
- **Champions**  
  R_score ≥ 4, F_score ≥ 4, M_score ≥ 4  
  Our best customers—recent, frequent, and high spenders.
- **Loyal Customers**  
  R_score ≥ 3, F_score ≥ 3, M_score ≥ 3  
  Solid repeat buyers with strong spend.
- **Potential Loyalists**  
  R_score ≥ 4 _or_ (F_score ≥ 3 & M_score ≥ 3)  
  Very recent shoppers showing early signs of loyalty.
- **Potential High-Value**  
  F_score = 1, M_score ≥ 4  
  Low-frequency “whales” whose single purchases are large.
- **Bargain Hunters**  
  F_score ≥ 4, M_score ≤ 2  
  Frequent buyers who spend modestly each time.
- **Promising**  
  R_score ≥ 3, F_score ≤ 2, M_score ≤ 3  
  Moderately recent shoppers with room to grow.
- **Can’t Lose Them**  
  F_score ≥ 3, M_score ≥ 4, R_score ≤ 2  
  Historically valuable customers whose recency has slipped.
- **At Risk**  
  M_score ≥ 3, R_score ≤ 2  
  High-value customers drifting toward inactivity.
- **Need Attention**  
  F_score ≥ 2, M_score ≤ 2, R_score = 3  
  Mid-tier customers we should re-engage before they slip.
- **About To Sleep**  
  R_score ≤ 2, F_score ≤ 2, M_score ≤ 2  
  Low engagement across all dimensions—likely to churn.
- **Lost**  
  R_score = 1, F_score = 1, M_score ≤ 2  
  Inactive, one-time buyers from long ago.
- **Unclassified**  
  Any remaining edge cases (should be nearly zero if logic is exhaustive).

We implement these rules in a single `dplyr::case_when()` block—checking **First-Time Buyers** first, then each segment in descending order of value, and ending with a catch-all "Unclassified" to capture any combinations we may have missed.

**Note on Methodology**  
When I first built the RFM segments, they relied solely on R/F/M scores and noticed a large “Unclassified” bucket—many customers whose raw recency and frequency mimicked true newcomers were slipping through.  
To address this, I added a **First-Time Buyer** flag (based on each user’s first-ever purchase date) _before_ any RFM scoring, then iterated `case_when()` logic, tweaking thresholds and adding special cases (e.g. “Bargain Hunters,” “Potential High-Value”) until every customer fell into a meaningful segment.  
What follows is the final, workflow: we compute the new-customer flags up front, then assign **First-Time Buyers**, and finally apply a standard RFM hierarchy to capture the rest of the customer base with no one left unclassified.

```{r 06-flag-and-segment, echo=TRUE, include=TRUE}
# Compute first-ever purchase date and window flags
first_purchase_dates <- transactions %>%
  filter(is_returned == FALSE) %>%
  group_by(user_id) %>%
  summarise(first_purchase_date = min(order_date), .groups="drop") %>%
  mutate(
    new_in_FY2023 = first_purchase_date >= as.Date("2022-07-01") &
                     first_purchase_date <= as.Date("2023-06-30"),
    new_in_FY2024 = first_purchase_date >= as.Date("2023-07-01") &
                     first_purchase_date <= as.Date("2024-06-30"),
    new_in_FY2025 = first_purchase_date >= as.Date("2024-07-01") &
                     first_purchase_date <= as.Date("2025-06-30")
  )

# Join flags into each period’s RFM table
rfm_w1 <- rfm_w1 %>% left_join(first_purchase_dates %>% select(user_id, new_in_FY2023), by="user_id")
rfm_w2 <- rfm_w2 %>% left_join(first_purchase_dates %>% select(user_id, new_in_FY2024), by="user_id")
rfm_w3 <- rfm_w3 %>% left_join(first_purchase_dates %>% select(user_id, new_in_FY2025), by="user_id")

# FY2023 RFM Scoring with First-Time Value Tiers
rfm_2023_scored <- rfm_w1 %>%
  mutate(
    R_score = ntile(-Recency_days, 5),
    F_score = case_when(Frequency >= 3 ~ 5,
                        Frequency == 2 ~ 4,
                        TRUE           ~ 1),
    M_score = ntile(Monetary, 5)
  ) %>%
  mutate(
    segment = case_when(
      # ——— First-Time Buyers split by Monetary value ———
      new_in_FY2023 & M_score >= 4   ~ "First-Time High-Value",
      new_in_FY2023 & M_score <= 2   ~ "First-Time Low-Value",
      new_in_FY2023                  ~ "First-Time Mid-Value",
      
      # ——— Established RFM segments ———
      R_score >= 4 & F_score >= 4 & M_score >= 4   ~ "Champions",
      R_score >= 3 & F_score >= 3 & M_score >= 3   ~ "Loyal Customers",
      R_score >= 4 & (F_score >= 3 | M_score >= 3) ~ "Potential Loyalists",
      R_score >= 2 & F_score == 1 & M_score >= 4   ~ "Potential High-Value",
      F_score >= 4 & M_score <= 2                  ~ "Bargain Hunters",
      R_score >= 3 & F_score <= 2 & M_score <= 3   ~ "Promising",
      R_score <= 2 & F_score >= 3 & M_score >= 4   ~ "Can't Lose Them",
      R_score <= 2 & M_score >= 3                  ~ "At Risk",
      R_score == 3 & F_score >= 2 & M_score <= 2   ~ "Need Attention",
      R_score <= 2 & F_score <= 2 & M_score <= 2   ~ "About To Sleep",
      R_score == 1 & F_score == 1 & M_score <= 2   ~ "Lost",
      TRUE                                           ~ "Unclassified"
    )
  )

# FY2024 RFM Scoring with First-Time Value Tiers
rfm_2024_scored <- rfm_w2 %>%
  mutate(
    R_score = ntile(-Recency_days, 5),
    F_score = case_when(Frequency >= 3 ~ 5,
                        Frequency == 2 ~ 4,
                        TRUE           ~ 1),
    M_score = ntile(Monetary, 5)
  ) %>%
  mutate(
    segment = case_when(
      new_in_FY2024 & M_score >= 4   ~ "First-Time High-Value",
      new_in_FY2024 & M_score <= 2   ~ "First-Time Low-Value",
      new_in_FY2024                  ~ "First-Time Mid-Value",
      R_score >= 4 & F_score >= 4 & M_score >= 4   ~ "Champions",
      R_score >= 3 & F_score >= 3 & M_score >= 3   ~ "Loyal Customers",
      R_score >= 4 & (F_score >= 3 | M_score >= 3) ~ "Potential Loyalists",
      R_score >= 2 & F_score == 1 & M_score >= 4   ~ "Potential High-Value",
      F_score >= 4 & M_score <= 2                  ~ "Bargain Hunters",
      R_score >= 3 & F_score <= 2 & M_score <= 3   ~ "Promising",
      R_score <= 2 & F_score >= 3 & M_score >= 4   ~ "Can't Lose Them",
      R_score <= 2 & M_score >= 3                  ~ "At Risk",
      R_score == 3 & F_score >= 2 & M_score <= 2   ~ "Need Attention",
      R_score <= 2 & F_score <= 2 & M_score <= 2   ~ "About To Sleep",
      R_score == 1 & F_score == 1 & M_score <= 2   ~ "Lost",
      TRUE                                           ~ "Unclassified"
    )
  )

# FY2025 RFM Scoring with First-Time Value Tiers
rfm_2025_scored <- rfm_w3 %>%
  mutate(
    R_score = ntile(-Recency_days, 5),
    F_score = case_when(Frequency >= 3 ~ 5,
                        Frequency == 2 ~ 4,
                        TRUE           ~ 1),
    M_score = ntile(Monetary, 5)
  ) %>%
  mutate(
    segment = case_when(
      new_in_FY2025 & M_score >= 4   ~ "First-Time High-Value",
      new_in_FY2025 & M_score <= 2   ~ "First-Time Low-Value",
      new_in_FY2025                  ~ "First-Time Mid-Value",
      R_score >= 4 & F_score >= 4 & M_score >= 4   ~ "Champions",
      R_score >= 3 & F_score >= 3 & M_score >= 3   ~ "Loyal Customers",
      R_score >= 4 & (F_score >= 3 | M_score >= 3) ~ "Potential Loyalists",
      R_score >= 2 & F_score == 1 & M_score >= 4   ~ "Potential High-Value",
      F_score >= 4 & M_score <= 2                  ~ "Bargain Hunters",
      R_score >= 3 & F_score <= 2 & M_score <= 3   ~ "Promising",
      R_score <= 2 & F_score >= 3 & M_score >= 4   ~ "Can't Lose Them",
      R_score <= 2 & M_score >= 3                  ~ "At Risk",
      R_score == 3 & F_score >= 2 & M_score <= 2   ~ "Need Attention",
      R_score <= 2 & F_score <= 2 & M_score <= 2   ~ "About To Sleep",
      R_score == 1 & F_score == 1 & M_score <= 2   ~ "Lost",
      TRUE                                           ~ "Unclassified"
    )
  )
```


## Segment Profiles per Period

For a deeper understanding, we can calculate some Key Performance Indicators (KPIs) for each segment in each period:

- Number of customers in the segment.
- Total revenue (Monetary sum) contributed by that segment.
- Average Frequency and Monetary per customer in the segment.
- Percentage of overall revenue from that segment.

```{r 07-kpi-calc, echo=TRUE, include=TRUE}
# Combine all scored RFM tables into one dataframe
rfm_all <- bind_rows(
  rfm_2023_scored %>% mutate(segment_window = "2022-2023"),
  rfm_2024_scored %>% mutate(segment_window = "2023-2024"),
  rfm_2025_scored %>% mutate(segment_window = "2024-2025")
)

# Compute KPIs for each Window x Segment
kpi_by_window <- rfm_all %>%
  group_by(segment_window, segment) %>%
  summarise(
    Customers     = n(),
    Avg_Freq      = mean(Frequency, na.rm=TRUE),
    Avg_Spend     = mean(Monetary, na.rm=TRUE),
    Total_Revenue = sum(Monetary, na.rm=TRUE),
    .groups       = 'drop'
  ) %>%
  group_by(segment_window) %>%
  mutate(Rev_Share = Total_Revenue / sum(Total_Revenue) * 100) %>%
  ungroup()

# Display KPIs for all windows in a wide format
kpi_by_window %>%
  pivot_wider(names_from = segment_window, values_from = c(Customers, Avg_Freq, Avg_Spend, Total_Revenue, Rev_Share)) %>%
  knitr::kable(
    caption = "Segment KPI Summary Across Windows"
  )
```
*(The above table shows how each segment contributes to business outcomes as well as how many customers are in each segment for each window.)* 

**Insights from segment profiles:**

- **First-Time Buyers Remain the Largest Segment.** Combined, non-first-time segments still account for under 10% of customers and revenue in every window.
- With so much reliance on **First-Time Buyers**, any drop in acquisition will ripple through revenue immediately.
- The slow growth of **Champions** and other high-value segments, despite some improvement, indicates retention and loyalty efforts need to be scaled and targeted, especially at the mid-tier (Promising/Potential Loyalists) to lift them into higher-value categories.
- **Migration analysis** next will quantify exactly how few First-Time Buyers convert into these smaller, high-value segments in subsequent windows, underscoring specific retention gaps.

# Customer Migration Analysis

One key goal is to understand how individual customers migrate between segments from one period to the next. High churn or failure to retain new customers will be evident in these transitions. We analyze two transitions:

1. **FY2023 -> FY2024** (Year 1 to Year 2)
2. **FY2024 -> FY2025** (Year 2 to Year 3)

We create migration tables showing how many customers moved from each segment in the first period to each segment in the next period. We will also account for customers who appear in one period but not the next:

- Customers who were active in the first period but made no purchases in the next period will be labeled as "Inactive" in the next period.
- Customers who are new in the second period (no purchases in the prior period) will be labeled as "Inactive" coming from the first period’s perspective.

This allows us to quantify new additions and drop-offs between periods, alongside movements among active segments.

We analyze customer transitions between segments year-over-year using the migration tables.

- **segment_prev:** Segment in the prior period ("Inactive" if the customer did not purchase)
- **segment_next:** Segment in the next period ("Inactive" if the customer lapsed)
- **n:** Number of customers moving between those segments

These counts enable us to:

- **Measure new-customer retention**: how many customers acquired in year 1 made a purchase in year 2.
- **Measure churn**: how many active customers in year 1 did not return in year 2.
- **Identify top segment transitions**: which flows dominate (e.g. New-Promising, Loyal-Champion).
```{r 08-build-migrations, echo=TRUE, include=TRUE}
# Build user‐segment lists for each window
segment_by_user <- list(
  FY2023 = rfm_2023_scored %>% select(user_id, segment),
  FY2024 = rfm_2024_scored %>% select(user_id, segment),
  FY2025 = rfm_2025_scored %>% select(user_id, segment)
)

# Function: full migration counts between two periods
migration_table <- function(prev_window, next_window) {
  full_join(
    segment_by_user[[prev_window]] %>% rename(segment_prev = segment),
    segment_by_user[[next_window]] %>% rename(segment_next = segment),
    by = "user_id"
  ) %>%
    mutate(
      segment_prev = coalesce(segment_prev, "Inactive"),
      segment_next = coalesce(segment_next, "Inactive")
    ) %>%
    count(segment_prev, segment_next, name = "n")
}

# Generate migrations
mig_23_24 <- migration_table("FY2023", "FY2024")
mig_24_25 <- migration_table("FY2024", "FY2025")

# Global retention vs. churn (only those active in prior period)
summarize_global <- function(mig_df) {
  mig_df %>%
    filter(segment_prev != "Inactive") %>%
    mutate(
      status = if_else(segment_next != "Inactive", "Retained", "Churned")
    ) %>%
    group_by(status) %>%
    summarise(
      n = sum(n),                       # sum the customer counts
      .groups = "drop"
    ) %>%
    # if you want a rate beside it, you can still do
    mutate(share = round(n / sum(n), 4))
}

retention_23_24 <- summarize_global(mig_23_24)
retention_24_25 <- summarize_global(mig_24_25)

knitr::kable(retention_23_24, caption = "FY2023 → FY2024 Retention & Churn")
knitr::kable(retention_24_25, caption = "FY2024 → FY2025 Retention & Churn")

# Segment‐level retention (drop “Inactive” origin)
segment_retention <- function(mig_df) {
  mig_df %>%
    filter(segment_prev != "Inactive") %>%
    group_by(segment_prev) %>%
    summarise(
      total_in_segment = sum(n),
      retained          = sum(n[segment_next != "Inactive"]),
      retention_rate    = round(retained / total_in_segment, 4),
      .groups = "drop"
    ) %>%
    arrange(desc(retention_rate))
}

retention_by_segment_23_24 <- segment_retention(mig_23_24)
retention_by_segment_24_25 <- segment_retention(mig_24_25)

knitr::kable(
  retention_by_segment_23_24,
  caption = "Segment-Level Retention FY2023 → FY2024"
)
knitr::kable(
  retention_by_segment_24_25,
  caption = "Segment-Level Retention FY2024 → FY2025"
)

# FY2023 → FY2024 migration counts matrix
mig_23_24_counts <- mig_23_24 %>%
  tidyr::pivot_wider(
    names_from  = segment_next,
    values_from = n,
    values_fill = 0
  )
knitr::kable(
  mig_23_24_counts,
  caption = "FY2023 → FY2024 Migration Counts (by origin segment)"
)

# FY2024 → FY2025 migration counts matrix
mig_24_25_counts <- mig_24_25 %>%
  tidyr::pivot_wider(
    names_from  = segment_next,
    values_from = n,
    values_fill = 0
  )
knitr::kable(
  mig_24_25_counts,
  caption = "FY2024 → FY2025 Migration Counts (by origin segment)"
)


```
*The table above shows a matrix of previous and current segments for the 2024-2025 RFM observation window. The counts indicate how many customers moved from the previous segment to the corresponding new segment. Inactive to a segment means a new or reactivated customer. A segment to inactive means a customer churned.*

**Key Takeaways from Migration & Retention:**

- As obvious from segment populations, we see **acquisition-led growth**. 60–64% of the base each year is brand-new, while only ~7–8% of those new customers re-purchase the following year.
- **Retention remains low across the board**.
  - Overall retention of active customers ticked up slightly from ~7% (’23→’24) to ~8.5% (’24→’25), but that still means 91–93% of last year’s buyers never showed up again.
  - Segment-level retention is uniformly poor. Even “Champions” and “Loyal” groups retain under 10% year over year, indicating systemic churn.
- **Missed opportunity for mid-tier segments**. “Potential” and “Promising” customers account for a large share of active buyers but convert at just 8–11%. These are the cohorts we should prioritize for nurture campaigns.
- **At-risk wins are small.** Very few “At Risk” or “Can’t Lose Them” customers actually reactivate - these high-value but dormant segments need more aggressive win-back offers.

To better visualize these transitions, we can use a **Sankey diagram** that shows the flow of customers from segments in one period to segments in the next. Each segment in period 1 and period 2 is a node, and flow widths are proportional to the number of customers moving between those nodes. I'll do this in Tableau Public utilizing an exported csv (this will be done in the visualization section).

## Visualizing The Data

In this section, we present faceted visualizations that bring the segment KPI results to life across all three periods. Faceting allows direct comparison of patterns year-over-year within a single chart layout.

### Revenue Share by Segment (Faceted by Period)
By faceting revenue bars by period, we can easily compare which segments grew or shrank in revenue share across years. For instance, Champions may contribute an increasing share in FY2025 compared to FY2023, while others plateau or decline.
```{r 09-rev-by-segment, echo=TRUE, fig.cap="Revenue by Segment Across Periods"}
# Named list of RFM data frames
segmented_rfm <- list(
  `2022-2023` = rfm_2023_scored,
  `2023-2024` = rfm_2024_scored,
  `2024-2025` = rfm_2025_scored
)

# Manipulate data and plot
bind_rows(
  map2(segmented_rfm, names(segmented_rfm), ~ mutate(.x, Period = .y))
) %>%
  group_by(Period, segment) %>%
  summarise(Total_Revenue = sum(Monetary, na.rm = TRUE), .groups = "drop") %>%
  ggplot(aes(x = reorder(segment, Total_Revenue), y = Total_Revenue / 1000, fill = segment)) +
  geom_col(show.legend = FALSE) +
  coord_flip() +
  facet_wrap(~ Period) +
  labs(
    title = "Revenue by Segment Across Periods",
    x = "Segment",
    y = "Revenue (in $1K)"
  ) +
  theme_minimal()
```

### Revenue Per Customer by Segment (Faceted Across Periods)
This bar chart shows the average revenue generated per customer in each segment for FY2023, FY2024, and FY2025. By faceting on segment and plotting a trio of colored bars (one per year), we can compare how much each type of customer contributes on a per‐head basis and how their value evolves year over year. This view complements overall revenue trends by normalizing for segment size, helping us understand which groups deliver the greatest return on acquisition and where there may be upside in shifting focus.
```{r 10-rev-per-cust, echo=TRUE, fig.cap="Revenue per Customer by Segment Across Periods"}
# compute revenue per customer by segment & period
rev_pc_df <- bind_rows(
  map2(segmented_rfm, names(segmented_rfm), ~ .x %>% mutate(Period = .y))
) %>%
  group_by(Period, segment) %>%
  summarise(
    total_revenue        = sum(Monetary, na.rm = TRUE),
    n_customers          = n_distinct(user_id),
    revenue_per_customer = total_revenue / n_customers,
    .groups = "drop"
  )

# plot faceted bar chart with labels
ggplot(rev_pc_df, aes(x = Period, y = revenue_per_customer, fill = Period)) +
  geom_col(width = 0.6, show.legend = FALSE) +
  geom_text(
    aes(label = dollar(round(revenue_per_customer, 0))),
    vjust = -0.5,
    size = 2.8
  ) +
  facet_wrap(~ segment, scales = "free_y", ncol = 3) +
  scale_y_continuous(
    labels = dollar_format(prefix = "$"),
    expand = expansion(mult = c(0, 0.12))
  ) +
  labs(
    title = "Revenue per Customer by Segment Across Periods",
    x     = "Period",
    y     = "Revenue per Customer (USD)"
  ) +
  theme_minimal() +
  theme(
    axis.text.x = element_text(angle = 45, hjust = 1),
    strip.text  = element_text(size = 8)
  )
```

### AOV Trend by Segment (Faceted)
This faceted line chart clearly shows how average order value for each segment evolves over time, highlighting segments that are improving in spending versus those that are stagnant or declining.
```{r 11-aov-trend, echo=TRUE, fig.cap="AOV Trend by Segment"}
# Combine all three windows into one data frame with a Period identifier
aov_data <- bind_rows(
  map2(segmented_rfm, names(segmented_rfm), ~ .x %>% mutate(Period = .y))
) %>%
  group_by(Period, segment) %>%
  summarise(
    AOV = sum(Monetary, na.rm = TRUE) / sum(Frequency, na.rm = TRUE),
    .groups = "drop"
  )

# Plot AOV trends
ggplot(aov_data, aes(x = Period, y = AOV, group = segment)) +
  geom_line() +
  geom_point() +
  facet_wrap(~ segment, scales = "free_y", ncol = 3) +
  scale_y_continuous(
    labels = dollar_format(prefix = "$", big.mark = ","),
    expand = expansion(mult = c(0, 0.02))
  ) +
  labs(
    title = "AOV Trend by Segment",
    x = "Period",
    y = "Average Order Value (USD)"
  ) +
  theme_minimal() +
  theme(
    axis.text.x = element_text(angle = 45, hjust = 1),
    strip.text = element_text(size = 8)
  )
```

### Return Rate Heatmap (Faceted by Segment)
Faceting this heatmap by segment isolates each segment’s return rate trends, making it easier to see if returns are improving or worsening over time within specific customer groups.
```{r 12-return-heatmap, echo=TRUE, fig.cap="Return Rate by Segment & Period"}
# Build a customer‐period return flag from the raw transactions
customer_returns <- transactions %>%
  # assign each order_date to a window label
  mutate(
    Period = case_when(
      order_date >= as.Date("2022-07-01") & order_date <= as.Date("2023-06-30") ~ "2022-2023",
      order_date >= as.Date("2023-07-01") & order_date <= as.Date("2024-06-30") ~ "2023-2024",
      order_date >= as.Date("2024-07-01") & order_date <= as.Date("2025-06-30") ~ "2024-2025",
      TRUE ~ NA_character_
    )
  ) %>%
  filter(!is.na(Period)) %>%
  group_by(user_id, Period) %>%
  summarise(
    return_flag = any(is_returned),   # TRUE if they returned at least once
    .groups = "drop"
  )

# Bind the three RFM segment tables together, add the Period, and join in the return_flag
rfm_with_returns <- bind_rows(
  rfm_2023_scored %>% mutate(Period = "2022-2023"),
  rfm_2024_scored %>% mutate(Period = "2023-2024"),
  rfm_2025_scored %>% mutate(Period = "2024-2025")
) %>%
  select(user_id, segment, Period) %>%
  left_join(customer_returns, by = c("user_id","Period")) %>%
  replace_na(list(return_flag = FALSE))    # customers with no return records get FALSE

# Summarise the number and rate of returners by segment & period
returns_by_segment <- rfm_with_returns %>%
  group_by(Period, segment) %>%
  summarise(
    n_customers = n(),
    n_returns   = sum(return_flag),
    return_rate = round(n_returns / n_customers, 4),
    .groups = "drop"
  ) %>%
  arrange(Period, desc(return_rate))

# prepare & plot
returns_by_segment %>%
  # convert rate to percent for labeling
  mutate(return_pct = return_rate * 100) %>%
  ggplot(aes(x = Period, y = segment, fill = return_pct)) +
    geom_tile(color = "white") +
    scale_fill_gradient(
      low  = "lightgoldenrod1",
      high = "firebrick3",
      name = "Return Rate (%)"
    ) +
    labs(
      title = "Return Rate by Segment & Period",
      x     = "Segment Window",
      y     = "Segment"
    ) +
    theme_minimal() +
    theme(
      axis.text.x = element_text(angle = 45, hjust = 1),
      panel.grid  = element_blank()
    )
```

### Traffic Source Mix by Segment (Faceted by Period)
This faceted bar chart shows how the customer acquisition channels differ by segment and period. It helps identify which channels are most effective at bringing in high-value segments vs. segments with high return rates.
```{r 13-traffic-mix, echo=TRUE, fig.cap="Traffic Source Mix by Segment Across Periods"}
# Combine all three windows into one data frame, tagging each row with its period
traffic_data <- bind_rows(
  map2(segmented_rfm, names(segmented_rfm),
       ~ .x %>% mutate(Period = .y))
) %>%
  group_by(Period, segment, traffic_source) %>%
  summarise(n = n(), .groups = "drop") %>%
  group_by(Period, segment) %>%
  mutate(proportion = n / sum(n)) %>%
  ungroup()

# Plot
ggplot(traffic_data, aes(x = Period, y = proportion, fill = traffic_source)) +
  geom_col(position = "fill") +
  facet_wrap(~ segment, ncol = 3, scales = "free_y") +
  scale_y_continuous(
    labels = percent_format(accuracy = 1),
    expand = expansion(mult = c(0, 0.02))
  ) +
  labs(
    title = "Traffic Source Mix by Segment Across Periods",
    x = "Period",
    y = "Proportion of Customers",
    fill = "traffic_source"
  ) +
  theme_minimal() +
  theme(
    axis.text.x = element_text(
      angle  = -45,   # rotate labels up
      hjust  = 0,     # left-justify along their new baseline
      vjust  = 1.1    # move them up toward the axis line
    ),
    strip.text = element_text(size = 8)
  )
```


### Sankey Diagram of Segment Flows

```{r 14-build-sankey-data, echo=TRUE, include=TRUE}
# Compute each customer’s first-ever transaction date (against your full transactions table)
first_transaction_dates <- transactions %>%
  group_by(user_id) %>%
  summarise(
    first_transaction_date = min(order_date),
    .groups = "drop"
  )

# Build a wide user‐segment lookup across the three windows
seg_wide <- rfm_2023_scored %>%
  select(user_id, segment_2023 = segment) %>%
  full_join(
    rfm_2024_scored %>% select(user_id, segment_2024 = segment),
    by = "user_id"
  ) %>%
  full_join(
    rfm_2025_scored %>% select(user_id, segment_2025 = segment),
    by = "user_id"
  ) %>%
  # Bring in traffic_source (from your customers table) and first-transaction-date
  left_join(customers %>% select(user_id, traffic_source), by = "user_id") %>%
  left_join(first_transaction_dates, by = "user_id") %>%
  # 4) Compute a single “new_flag” for the entire 3-year span
  mutate(
    new_flag = first_transaction_date >= as.Date("2022-07-01") &
               first_transaction_date <= as.Date("2025-06-30")
  ) %>%
  select(user_id, segment_2023, segment_2024, segment_2025, traffic_source, new_flag)

# Aggregate into the Sankey‐ready format
sankey_input <- seg_wide %>%
  group_by(segment_2023, segment_2024, segment_2025, traffic_source, new_flag) %>%
  summarise(n = n(), .groups = "drop")

# Export to CSV for Tableau Public
write.csv(sankey_input, "sankey_input.csv")
```

## Customer Segment Migration (All Customers)

![Segment Population Movement June 2022 – June 2025](assets/images/segment_population_flow_sankey.png)

*Figure 1. Sankey diagram in Tableau Public showing how customers flow between RFM segments from 2022 through the end of the observaton window in 2025.*

## Customer Segment Migration (New Customers Only)

![New‐Customer Segment Movement June 2022 – June 2025](assets/images/segment_newpopulation_flow_sankey.png)

*Figure 2. Same migration flows filtered to only first-time buyers in each period.*

**Here is a live embedded version:**
<div class='tableauPlaceholder' id='viz1751865616462' style='position: relative'>
  <noscript>
    <a href='#'>
      <img
        alt='Segment Population Movement June 2022 – June 2025'
        src='https://public.tableau.com/static/images/CD/CD3Z9HN8R/1_rss.png'
        style='border: none'
      />
    </a>
  </noscript>
  <object class='tableauViz' style='display:none;'>
    <param name='host_url' value='https%3A%2F%2Fpublic.tableau.com%2F' /> 
    <param name='embed_code_version' value='3' /> 
    <param name='path' value='shared/CD3Z9HN8R' /> 
    <param name='toolbar' value='yes' />
    <param name='static_image' value='https://public.tableau.com/static/images/CD/CD3Z9HN8R/1.png' />
    <param name='animate_transition' value='yes' />
    <param name='display_static_image' value='yes' />
    <param name='display_spinner' value='yes' />
    <param name='display_overlay' value='yes' />
    <param name='display_count' value='yes' />
    <param name='language' value='en-US' />
  </object>
</div>
<script type='text/javascript'>
  var divElement = document.getElementById('viz1751865616462');
  var vizElement = divElement.getElementsByTagName('object')[0];
  vizElement.style.width='100%';
  vizElement.style.height=(divElement.offsetWidth*0.75)+'px';
  var scriptElement = document.createElement('script');
  scriptElement.src = 'https://public.tableau.com/javascripts/api/viz_v1.js';
  vizElement.parentNode.insertBefore(scriptElement, vizElement);
</script>


# Insights and Recommendations

## Key findings from the RFM segmentation and migrations:

- **Rapid Customer Base Growth**: Each year the number of purchasing customers grew substantially (FY2025 had nearly 3x the active customers of FY2023). This was driven mainly by new customer acquisition. However, such growth can mask underlying retention issues.
- **Low Retention and Repeat Purchase Rates**: A striking observation is the low retention of customers from year to year. Over 90% of customers in one year did not purchase again the next year. Most notably, only ~7–9% of first-time buyers returned in the subsequent year, indicating a potential problem with customer satisfaction or loyalty programs. The business is losing the bulk of new customers after their first purchase.
- **Champions and Loyal Customers Are Rare**: Only a small elite segment (Champions) made multiple purchases and contributed high revenue in each period. For instance, in FY2025 Champions might constitute ~1% of customers but contribute 5–10% of revenue. The Loyal Customers segment is also relatively small. This suggests **opportunity to grow these segments** by improving retention – converting more one-time buyers into repeat loyalists.
- **Revenue Concentration**: A classic 80/20 rule is evident – a minority of customers (Champions, Loyal, and a few others) account for a large share of revenue. In FY2025, for example, we might see the top 2–3 segments contribute the majority of sales. Protecting and expanding these high-value groups is critical.
- **At-Risk High-Value Customers**: We identified customers who had been high frequency or high spend in one period but did not purchase in the next (falling into "At Risk" or "Can't Lose Them"). Losing these customers can significantly impact revenue. Specific outreach (personalized offers, re-engagement campaigns) to this group is recommended.
- **Dominance of New and Promising Segments**: Every period shows a huge influx of New Customers and a large "Promising" group (recent but low spend/frequency). This indicates strong marketing/customer acquisition performance to bring in new shoppers. However, the challenge is converting these into loyal repeat customers. Strategies such as **welcome offers, loyalty rewards, and excellent first-purchase experience** could help improve the conversion of new customers into second purchase (raising that 7–9% repeat rate).
- **Customer Migration Patterns**: The Sankey/migration analysis highlights that many customers flow from being active to inactive year-over-year. Only a small flow goes upward (e.g. New -> Loyal). There is also a flow of previously inactive customers coming in as new each year. This dynamic suggests the business is heavily reliant on continuously finding new customers, which can be more expensive than retaining existing ones.


# Insights & Recommendations

## Key Findings
- **Sky-high acquisition, low repeat.** Active customers grew from ~4.4 K → 6.9 K → 12.9 K over our three windows, driven almost entirely by first-time buyers. Yet only ~7–9 % of those new customers ever returned in the following year.
- **Overall retention is vanishing.** Fewer than 10 % of any cohort make a second purchase; >90 % of all customers churn year-to-year.
- **Revenue is ultra-concentrated.** Champions and Loyal Customers comprise ≪5 % of the base but account for roughly 30–50 % of total revenue each period.
- **At-risk high-value customers.** A small group with high frequency or spend in one period lapses entirely in the next (“At Risk” + “Can’t Lose Them”). Losing them disproportionately dents revenue.
- **“Promising” segment opportunity.** A large middle tier of recent but low-spend shoppers (Promising) could be coaxed into higher RFM tiers with targeted offers.
- **Elevated Returns in High-Value Segments.** We observe that our top segments (Loyal Customers, Champions, Can’t Lose Them) also show above-average return rates.
- **Search is the dominant acquisition channel across most segments**, but high-value groups (Champions, Loyal Customers) show a larger share coming from Email and Display, suggesting these channels drive more profitable customer behaviors.

## Recommendations
1. **Boost new-customer conversion.**
  - Auto-trigger a “second-purchase” email or discount within 2–4 weeks of a first order.
  - Measure lift: even a +5 pp bump (to 12–14 %) in new->repeat would add hundreds more returning buyers each year.
2. **Protect high-value lapsed customers.**
  - Identify “At Risk” and “Can’t Lose Them” segments each month and send personalized win-back incentives.
  - Aim to cut churn in that cohort by half; each retained customer here delivers >$150 on average.
3. **Invest in a simple loyalty program.**
  - Roll out tiered perks (e.g. points or free shipping) focused on moving Promising to Loyal.
  - Track month-over-month growth in Loyal/Champion counts as a primary KPI.
4. **Use segment-based messaging.**
  - **Champions**: early-access previews, referral bonuses.
  - **Potential Loyalists**: “you’re so close” reminders and product bundles.
  - **About to Sleep/Lost**: feedback surveys + re-engagement coupons.
5. **Institutionalize monthly RFM monitoring.**
  - Automate RFM analysis pipeline on a rolling 12-month window.
  - Dashboard core metrics (segment sizes, retention rate, revenue concentration) so sales/marketing can spot shifts as soon as they occur.
6. **Drill into Returns.** 
  - Benchmark these segment-level return rates against industry norms. If they exceed typical “try-on” returns, investigate root causes (fit issues, product quality, inaccurate listings) and revise descriptions, QC or post-purchase guidance to cut down on unnecessary returns.
7. **Refine acquisition channel strategy by segment.""
  - Increase investment in Email and Display campaigns targeted at high-value prospects to boost Champion and Loyal segment growth
  - Optimize Search and Organic efforts (SEO, paid search bids) to improve top-of-funnel volume without sacrificing quality
  - Use channel-segment performance metrics monthly to shift budget dynamically toward channels yielding the best RFM outcomes
  
*By shifting from an acquisition-only mindset to a balanced focus on retaining and growing your best customers, you’ll drive steadier, more profitable growth.*
