const path = require('path');

module.exports = {
  mode: 'development',  // 또는 'production'
  entry: './client.js',  // 입력 파일 경로
  output: {
    filename: 'app-bundle.js',
    path: path.resolve(__dirname, 'dist'),  // 출력 디렉토리
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
  devtool: 'source-map',
};