export default {
    typescript: {
      rewritePaths: {
        'src/': 'lib/'
      }
    },
    require: [
    "ts-node/register"
    ]
  }