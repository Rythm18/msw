#!/bin/bash
set -e

case "$1" in
  base)
    # Run existing GraphQL batching example tests  
    pnpm test:node test/node/graphql-api/batched-queries.apollo.test.ts test/node/graphql-api/batched-queries.batched-execute.test.ts
    ;;
  new)
    # Run newly added native batch handler tests
    pnpm test:node test/node/graphql-api/batch-handler.test.ts
    ;;
  *)
    echo "Usage: ./test.sh {base|new}"
    exit 1
    ;;
esac
