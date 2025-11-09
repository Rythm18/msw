/**
 * @vitest-environment node
 * Tests for native GraphQL batch operation handler
 */
import { graphql, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { HttpServer } from '@open-draft/test-server/http'

const httpServer = new HttpServer((app) => {
  app.post('/graphql', (req, res) => {
    const operations = req.body

    if (!Array.isArray(operations)) {
      return res.json({
        data: { server: { value: 'single-operation' } },
      })
    }

    // Simulate real server responses for unmocked operations
    const responses = operations.map((op: any) => {
      const operationName = op.query.match(/(?:query|mutation)\s+(\w+)/)?.[1]

      if (operationName === 'GetServer') {
        return {
          data: { server: { url: httpServer.http.address.href } },
        }
      }

      if (operationName === 'GetUnmocked') {
        return {
          data: { unmocked: { id: 'real-data' } },
        }
      }

      return {
        errors: [{ message: `Unknown operation: ${operationName}` }],
      }
    })

    res.json(responses)
  })
})

const server = setupServer(
  graphql.query('GetUser', ({ variables }) => {
    return HttpResponse.json({
      data: {
        user: {
          id: variables.id || 'default-id',
          name: 'John Doe',
        },
      },
    })
  }),
  graphql.query('GetProduct', () => {
    return HttpResponse.json({
      data: {
        product: {
          id: 'product-1',
          name: 'MSW Mug',
        },
      },
    })
  }),
  graphql.mutation('CreatePost', ({ variables }) => {
    return HttpResponse.json({
      data: {
        createPost: {
          id: 'post-123',
          title: variables.title,
        },
      },
    })
  }),
  graphql.query('FailingQuery', () => {
    return HttpResponse.json({
      errors: [
        {
          message: 'Mocked error',
          extensions: { code: 'MOCK_ERROR' },
        },
      ],
    })
  }),
)

beforeAll(async () => {
  await httpServer.listen()
  server.listen()
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(async () => {
  server.close()
  await httpServer.close()
})

describe('graphql.batch()', () => {
  it('handles batch requests with multiple mocked operations', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            query GetUser {
              user {
                id
                name
              }
            }
          `,
        },
        {
          query: `
            query GetProduct {
              product {
                id
                name
              }
            }
          `,
        },
      ]),
    })

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data).toEqual([
      {
        data: {
          user: {
            id: 'default-id',
            name: 'John Doe',
          },
        },
      },
      {
        data: {
          product: {
            id: 'product-1',
            name: 'MSW Mug',
          },
        },
      },
    ])
  })

  it('handles batch with variables', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            query GetUser($id: ID!) {
              user {
                id
                name
              }
            }
          `,
          variables: { id: 'user-456' },
        },
      ]),
    })

    const data = await response.json()

    expect(data).toEqual([
      {
        data: {
          user: {
            id: 'user-456',
            name: 'John Doe',
          },
        },
      },
    ])
  })

  it('combines mocked and passthrough operations', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            query GetUser {
              user {
                id
                name
              }
            }
          `,
        },
        {
          query: `
            query GetServer {
              server {
                url
              }
            }
          `,
        },
      ]),
    })

    const data = await response.json()

    expect(data).toEqual([
      {
        data: {
          user: {
            id: 'default-id',
            name: 'John Doe',
          },
        },
      },
      {
        data: {
          server: {
            // Passthrough operations are sent individually, not as batch
            value: 'single-operation',
          },
        },
      },
    ])
  })

  it('handles mutations in batch', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            mutation CreatePost($title: String!) {
              createPost {
                id
                title
              }
            }
          `,
          variables: { title: 'Hello MSW' },
        },
        {
          query: `
            query GetUser {
              user {
                id
                name
              }
            }
          `,
        },
      ]),
    })

    const data = await response.json()

    expect(data).toEqual([
      {
        data: {
          createPost: {
            id: 'post-123',
            title: 'Hello MSW',
          },
        },
      },
      {
        data: {
          user: {
            id: 'default-id',
            name: 'John Doe',
          },
        },
      },
    ])
  })

  it('preserves operation order in response', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            query GetProduct {
              product {
                id
              }
            }
          `,
        },
        {
          query: `
            query GetUser {
              user {
                id
              }
            }
          `,
        },
        {
          query: `
            query GetProduct {
              product {
                name
              }
            }
          `,
        },
      ]),
    })

    const data = await response.json()

    expect(data[0].data.product).toBeDefined()
    expect(data[0].data.user).toBeUndefined()

    expect(data[1].data.user).toBeDefined()
    expect(data[1].data.product).toBeUndefined()

    expect(data[2].data.product).toBeDefined()
    expect(data[2].data.user).toBeUndefined()
  })

  it('handles errors in individual operations without failing batch', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            query GetUser {
              user {
                id
              }
            }
          `,
        },
        {
          query: `
            query FailingQuery {
              data {
                value
              }
            }
          `,
        },
        {
          query: `
            query GetProduct {
              product {
                id
              }
            }
          `,
        },
      ]),
    })

    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data[0].data.user).toBeDefined()
    expect(data[0].errors).toBeUndefined()

    expect(data[1].errors).toEqual([
      {
        message: 'Mocked error',
        extensions: { code: 'MOCK_ERROR' },
      },
    ])

    expect(data[2].data.product).toBeDefined()
    expect(data[2].errors).toBeUndefined()
  })

  it('returns empty array for empty batch', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    })

    const data = await response.json()
    expect(data).toEqual([])
  })

  it('ignores non-array requests when batch handler is active', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetUser {
            user {
              id
            }
          }
        `,
      }),
    })

    // Should fall through to other handlers or real server
    const data = await response.json()
    expect(data.data).toBeDefined()
  })

  it('works with graphql.link() scoped handlers', async () => {
    const api = graphql.link(httpServer.http.url('/graphql'))

    server.use(
      api.query('GetCustomer', () => {
        return HttpResponse.json({
          data: {
            customer: { id: 'cust-1', email: 'test@example.com' },
          },
        })
      }),
      graphql.batch(httpServer.http.url('/graphql')),
    )

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            query GetUser {
              user {
                id
              }
            }
          `,
        },
        {
          query: `
            query GetCustomer {
              customer {
                id
                email
              }
            }
          `,
        },
      ]),
    })

    const data = await response.json()

    expect(data).toEqual([
      {
        data: {
          user: {
            id: 'default-id',
            name: 'John Doe',
          },
        },
      },
      {
        data: {
          customer: {
            id: 'cust-1',
            email: 'test@example.com',
          },
        },
      },
    ])
  })

  it('handles anonymous operations in batch', async () => {
    server.use(
      graphql.operation(() => {
        return HttpResponse.json({
          data: { anonymous: true },
        })
      }),
      graphql.batch(httpServer.http.url('/graphql')),
    )

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            {
              user {
                id
              }
            }
          `,
        },
      ]),
    })

    const data = await response.json()
    expect(data[0].data.anonymous).toBe(true)
  })

  it('allows all unmocked operations to pass through', async () => {
    server.use(graphql.batch(httpServer.http.url('/graphql')))

    const response = await fetch(httpServer.http.url('/graphql'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          query: `
            query GetUnmocked {
              unmocked {
                id
              }
            }
          `,
        },
        {
          query: `
            query GetServer {
              server {
                url
              }
            }
          `,
        },
      ]),
    })

    const data = await response.json()

    // Passthrough operations are sent individually to the real server
    expect(data).toEqual([
      {
        data: {
          server: {
            value: 'single-operation',
          },
        },
      },
      {
        data: {
          server: {
            value: 'single-operation',
          },
        },
      },
    ])
  })
})
