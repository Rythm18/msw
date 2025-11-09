import { HttpHandler, HttpMethods } from './HttpHandler'
import { HttpResponse } from '../HttpResponse'
import type { Path } from '../utils/matching/matchRequestUrl'
import type { RequestHandler } from './RequestHandler'
import { bypass } from '../bypass'
import { executeHandlers } from '../utils/executeHandlers'
import { createRequestId } from '@mswjs/interceptors'

export interface GraphQLBatchOperation {
  query: string
  variables?: Record<string, any>
  operationName?: string
}

/**
 * Internal registry to store handlers for batch processing.
 * This allows batch handlers to access all registered GraphQL handlers.
 */
const handlersRegistry = new WeakMap<
  GraphQLBatchHandler,
  Array<RequestHandler>
>()

/**
 * A specialized HTTP handler for GraphQL batch operations.
 * Intercepts array-formatted batch requests and routes each operation
 * to appropriate GraphQL handlers.
 */
export class GraphQLBatchHandler extends HttpHandler {
  constructor(endpoint: Path) {
    // Create base HTTP POST handler for the batch endpoint
    super(HttpMethods.POST, endpoint, async ({ request }) => {
      // Clone request to avoid consuming the original
      const requestForPeeking = request.clone()
      let operations: Array<GraphQLBatchOperation>

      try {
        const body = await requestForPeeking.json()

        // Only handle array-formatted batch requests
        if (!Array.isArray(body)) {
          return undefined
        }

        operations = body
      } catch {
        // Invalid JSON or non-JSON body, let other handlers process it
        return undefined
      }

      // Handle empty batch
      if (operations.length === 0) {
        return HttpResponse.json([])
      }

      // Get handlers from registry
      const handlers = handlersRegistry.get(this) || []

      // Clone for creating individual operation requests
      const requestClone = request.clone()

      // Process each operation in the batch
      const responses = await Promise.all(
        operations.map(async (operation) => {
          try {
            // Create a new request for this individual operation
            const operationRequest = new Request(requestClone.url, {
              method: 'POST',
              headers: requestClone.headers,
              body: JSON.stringify(operation),
            })

            // Try to find a matching handler for this operation
            const result = await executeHandlers({
              request: operationRequest,
              requestId: createRequestId(),
              handlers,
            })

            if (result?.response) {
              // Handler found, return its response
              return await result.response.json()
            }

            // No handler matched, pass through to actual server
            // Send as single operation (server will handle it as non-batch)
            const passthroughRequest = new Request(requestClone.url, {
              method: 'POST',
              headers: requestClone.headers,
              body: JSON.stringify(operation),
            })

            const passthroughResponse = await fetch(bypass(passthroughRequest))
            return await passthroughResponse.json()
          } catch (error) {
            // Return error response for this operation
            return {
              errors: [
                {
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Unknown error processing operation',
                },
              ],
            }
          }
        }),
      )

      return HttpResponse.json(responses)
    })
  }

  /**
   * Sets the handlers that this batch handler should route to.
   * @internal
   */
  setHandlers(handlers: Array<RequestHandler>): void {
    handlersRegistry.set(this, handlers)
  }
}

/**
 * Creates a GraphQL batch operation handler.
 *
 * @example
 * const api = graphql.link('https://api.example.com/graphql')
 * setupServer(
 *   api.query('GetUser', resolver),
 *   api.query('GetProduct', resolver),
 *   graphql.batch('https://api.example.com/graphql')
 * )
 *
 * @param endpoint - The URL or path to intercept batch requests
 */
export function createGraphQLBatchHandler(endpoint: Path): GraphQLBatchHandler {
  return new GraphQLBatchHandler(endpoint)
}
