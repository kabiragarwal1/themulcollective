#!/bin/sh
# Blocks commits that contain a Stripe secret, restricted or webhook key.
# Keys belong in Netlify's environment variables, never in this repository.
if git diff --cached -U0 | grep -E '^\+' | grep -qE '(sk|rk)_(live|test)_[0-9A-Za-z]{10,}|whsec_[0-9A-Za-z]{10,}'; then
  echo "Commit blocked: it contains what looks like a Stripe key. Put keys in Netlify environment variables instead." >&2
  exit 1
fi
