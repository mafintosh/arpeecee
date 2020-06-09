# arpeecee

Simple duplex stream based binary RPC module for well defined methods

```sh
npm install arpeecee
```

## Usage

```js
const RPC = require('arpeecee')

const stream = new RPC({
  errorEncoding: <some-abstract-encoding>
})

// define a method
const aMethod = stream.defineMethod({
  id: 1,
  requestEncoding: <some-abstract-encoding>,
  responseEncoding: <some-abstract-encoding>,
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
