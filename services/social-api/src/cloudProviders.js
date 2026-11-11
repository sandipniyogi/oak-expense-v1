
// Oak Social Cloud Providers — initial read-only API integration.
// Access tokens must be supplied by an authorized connection flow.
// Never log tokens or download links.

async function apiJson(url, headers = {}) {
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30000),
    redirect: 'error'
  });

  if (!response.ok) {
    throw new Error(`Cloud API returned HTTP ${response.status}`);
  }

  return response.json();
}

export async function listGoogleFolder(folderId, accessToken, pageToken = '') {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId))
    throw new Error('Invalid Google Drive folder ID');
  if (!accessToken) throw new Error('Google authorization required');

  const url = new URL('https://www.googleapis.com/drive/v3/files');

  url.searchParams.set(
    'q',
    `'${folderId}' in parents and trashed = false`
  );
  url.searchParams.set('pageSize', '100');
  url.searchParams.set(
    'fields',
    'nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime,parents,capabilities/canDownload)'
  );

  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const result = await apiJson(url, {
    Authorization: `Bearer ${accessToken}`
  });

  return {
    provider: 'google_drive',
    files: (result.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mime_type: f.mimeType,
      size: Number(f.size || 0),
      is_folder: f.mimeType === 'application/vnd.google-apps.folder',
      modified_at: f.modifiedTime || null,
      checksum: f.md5Checksum || null,
      can_download: f.capabilities?.canDownload !== false
    })),
    next_page: result.nextPageToken || null
  };
}

export async function listBaiduFolder(dir, accessToken, start = 0) {
  if (!accessToken) throw new Error('Baidu authorization required');
  if (!dir || !dir.startsWith('/'))
    throw new Error('Baidu folder path must start with /');

  const url = new URL('https://pan.baidu.com/rest/2.0/xpan/file');

  url.searchParams.set('method', 'list');
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('dir', dir);
  url.searchParams.set('start', String(start));
  url.searchParams.set('limit', '100');

  const result = await apiJson(url);

  if (result.errno !== 0) {
    throw new Error(`Baidu API error: ${result.errno}`);
  }

  const files = (result.list || []).map(f => ({
    id: String(f.fs_id),
    name: f.server_filename,
    path: f.path,
    size: Number(f.size || 0),
    is_folder: f.isdir === 1,
    modified_at: f.server_mtime || null,
    checksum: f.md5 || null
  }));

  return {
    provider: 'baidu_netdisk',
    files,
    next_page: files.length === 100 ? start + 100 : null
  };
}

export async function getBaiduDownloadMetadata(fsId, accessToken) {
  if (!/^\d+$/.test(String(fsId))) throw new Error('Invalid Baidu file ID');
  if (!accessToken) throw new Error('Baidu authorization required');

  const url = new URL(
    'https://pan.baidu.com/rest/2.0/xpan/multimedia'
  );

  url.searchParams.set('method', 'filemetas');
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fsids', `[${fsId}]`);
  url.searchParams.set('dlink', '1');

  const result = await apiJson(url);

  if (result.errno !== 0 || !result.list?.length) {
    throw new Error(`Baidu metadata unavailable: ${result.errno}`);
  }

  // This is an authorized API download-link candidate,
  // not a guarantee of anonymous direct download.
  return result.list[0];
}
