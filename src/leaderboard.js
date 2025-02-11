export const loadScores = () => {
    return []
}

export const addScore = ({ name = 'Anonymous', score }) => {
    // just for testing
    let url = atob('aHR0cHM6Ly9kaXNjb3JkLmNvbS9hcGkvd2ViaG9va3MvMTM0NTQzNTUzOTQ3MzU2Mzg1OS94ejdKM0dUYXBVV3UtcjFzd3g1UTlfcllNMWd2VlNvYkJwRXNHTUNBelYtQUF0RDBGaVNQRmVuWmhKdGc0RkwwQXBvVw==')

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `${name} achieved a score of ${score}` }),
    }).catch(_err => {})
}
