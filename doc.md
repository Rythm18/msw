# GraphQL Batch Operation Handler

## Problem Brief

MSW lacks built-in support for batched GraphQL requests, forcing users to write custom HTTP handlers that manually parse arrays and route operations. This creates boilerplate and inconsistent patterns. Add a native `graphql.batch()` API that automatically handles batched operations (array format) by routing each operation to appropriate handlers and aggregating responses.

## Agent Instructions

Implement a `graphql.batch(url, options)` handler that:
- Accepts POST requests with JSON body containing array of GraphQL operations
- Each operation has `query` (string) and optional `variables` (object)
- Parses operation names/types from each query in the batch
- Routes operations to existing graphql handlers (query/mutation) by matching operation names
- Collects all responses and returns them as JSON array in same order
- Supports partial mocking: if no handler matches, the operation passes through to actual server
- Handles errors per operation (failed operation doesn't fail entire batch)

The API should feel like natural extension of existing `graphql.query()` and `graphql.mutation()` handlers. Users should be able to use their existing handlers seamlessly with batching.

## Test Assumptions

- Export `graphql.batch` function from `msw/core` (alongside existing `graphql.query`, `graphql.mutation`)
- Batch handler accepts URL/path as first parameter
- Must work with standard Apollo/Relay batch format: `[{query: string, variables?: object}]`
- Response order must match request order exactly
- Passthrough uses `bypass()` for unmatched operations
