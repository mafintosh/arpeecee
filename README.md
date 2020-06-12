# arpeecee

Simple duplex stream based binary RPC module for well defined services and methods

```sh
npm install arpeecee
```

## Usage

```js
const RPC = require('arpeecee')

const stream = new RPC({
  errorEncoding: someAbstractEncoding
})

// define a method
const aMethod = stream.defineService({ id: 1 })
  .defineMethod({
    id: 1,
    requestEncoding: someAbstractEncoding,
    responseEncoding: someAbstractEncoding,
    async onrequest (value) {
      console.log('decoded request', value)
      // return decoded response
    }
  })

// call the method on the other side
const decodedResponse = await aMethod.request(decodedValue)

stream.pipe(someStream).pipe(stream)
```

## LICENSE

MIT
