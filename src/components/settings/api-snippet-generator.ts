'use client'

export type SnippetLang = 'curl' | 'js_fetch' | 'python_requests' | 'node_axios' | 'go' | 'java' | 'php'

export interface SnippetContext {
  baseUrl: string
  token: string
  workflowId: string
  // A minimal, opinionated default body users can edit
  exampleBody: Record<string, unknown>
}

export function buildExecuteUrl(ctx: SnippetContext): string {
  return `${ctx.baseUrl}/api/v1/workflows/${ctx.workflowId}/execute`
}

export function buildListUrl(ctx: Pick<SnippetContext, 'baseUrl'>): string {
  return `${ctx.baseUrl}/api/v1/workflows`
}

export function toPrettyJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}

export function generateExecuteSnippet(lang: SnippetLang, ctx: SnippetContext): string {
  const url = buildExecuteUrl(ctx)
  const bodyJson = toPrettyJson(ctx.exampleBody)

  switch (lang) {
    case 'curl':
      return `curl -X POST '${url}' \\\n  -H 'Authorization: Bearer ${ctx.token}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${bodyJson.replace(/'/g, "'\\''")}'`

    case 'js_fetch':
      return `const res = await fetch('${url}', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ${ctx.token}',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${bodyJson}),
});

const json = await res.json();
console.log(json);`

    case 'node_axios':
      return `import axios from 'axios';

const url = '${url}';
const res = await axios.post(url, ${bodyJson}, {
  headers: {
    Authorization: 'Bearer ${ctx.token}',
    'Content-Type': 'application/json',
  },
});

console.log(res.data);`

    case 'python_requests':
      return `import requests

url = "${url}"
headers = {
  "Authorization": "Bearer ${ctx.token}",
  "Content-Type": "application/json",
}
payload = ${bodyJson}

res = requests.post(url, headers=headers, json=payload)
print(res.status_code)
print(res.json())`

    case 'go':
      return `package main

import (
  "bytes"
  "fmt"
  "net/http"
)

func main() {
  url := "${url}"
  payload := []byte(${JSON.stringify(bodyJson)})

  req, _ := http.NewRequest("POST", url, bytes.NewBuffer(payload))
  req.Header.Set("Authorization", "Bearer ${ctx.token}")
  req.Header.Set("Content-Type", "application/json")

  client := &http.Client{}
  resp, err := client.Do(req)
  if err != nil {
    panic(err)
  }
  defer resp.Body.Close()

  fmt.Println("status:", resp.Status)
}`

    case 'java':
      return `// Java 11+ HttpClient
import java.net.URI;
import java.net.http.*;

public class Main {
  public static void main(String[] args) throws Exception {
    String url = "${url}";
    String body = ${JSON.stringify(bodyJson)};

    HttpRequest req = HttpRequest.newBuilder()
      .uri(URI.create(url))
      .header("Authorization", "Bearer ${ctx.token}")
      .header("Content-Type", "application/json")
      .POST(HttpRequest.BodyPublishers.ofString(body))
      .build();

    HttpClient client = HttpClient.newHttpClient();
    HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
    System.out.println(resp.statusCode());
    System.out.println(resp.body());
  }
}`

    case 'php':
      return `<?php

$url = '${url}';
$payload = ${bodyJson};

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  'Authorization: Bearer ${ctx.token}',
  'Content-Type: application/json',
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));

$response = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo $code . "\n";
echo $response;
?>`

    default:
      return ''
  }
}

export function generateListSnippet(lang: SnippetLang, ctx: Pick<SnippetContext, 'baseUrl' | 'token'>): string {
  const url = buildListUrl({ baseUrl: ctx.baseUrl })

  switch (lang) {
    case 'curl':
      return `curl '${url}' \\\n  -H 'Authorization: Bearer ${ctx.token}'`

    case 'js_fetch':
      return `const res = await fetch('${url}', {
  headers: {
    Authorization: 'Bearer ${ctx.token}',
  },
});

const json = await res.json();
console.log(json);`

    case 'node_axios':
      return `import axios from 'axios';

const res = await axios.get('${url}', {
  headers: {
    Authorization: 'Bearer ${ctx.token}',
  },
});

console.log(res.data);`

    case 'python_requests':
      return `import requests

url = "${url}"
headers = { "Authorization": "Bearer ${ctx.token}" }

res = requests.get(url, headers=headers)
print(res.status_code)
print(res.json())`

    case 'go':
      return `package main

import (
  "fmt"
  "net/http"
  "io"
)

func main() {
  url := "${url}"

  req, _ := http.NewRequest("GET", url, nil)
  req.Header.Set("Authorization", "Bearer ${ctx.token}")

  client := &http.Client{}
  resp, err := client.Do(req)
  if err != nil {
    panic(err)
  }
  defer resp.Body.Close()

  body, _ := io.ReadAll(resp.Body)
  fmt.Println(string(body))
}`

    case 'java':
      return `// Java 11+ HttpClient
import java.net.URI;
import java.net.http.*;

public class Main {
  public static void main(String[] args) throws Exception {
    String url = "${url}";

    HttpRequest req = HttpRequest.newBuilder()
      .uri(URI.create(url))
      .header("Authorization", "Bearer ${ctx.token}")
      .GET()
      .build();

    HttpClient client = HttpClient.newHttpClient();
    HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
    System.out.println(resp.statusCode());
    System.out.println(resp.body());
  }
}`

    case 'php':
      return `<?php

$url = '${url}';

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
  'Authorization: Bearer ${ctx.token}',
]);

$response = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo $code . "\\n";
echo $response;
?>`

    default:
      return ''
  }
}
