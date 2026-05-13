const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function fetchDashboardData() {
  try {
    const res = await fetch(`${API_BASE_URL}/`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch dashboard data");
    return await res.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function fetchContainersData() {
  try {
    const res = await fetch(`${API_BASE_URL}/containers`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch containers data");
    return await res.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function fetchStatsData() {
  try {
    const res = await fetch(`${API_BASE_URL}/stats`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch stats data");
    return await res.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function actionContainer(id: string, action: 'start' | 'stop' | 'restart' | 'delete') {
  try {
    const method = action === 'delete' ? 'DELETE' : 'POST';
    const url = action === 'delete' ? `${API_BASE_URL}/containers/${id}` : `${API_BASE_URL}/containers/${id}/${action}`;
    const res = await fetch(url, { method });
    if (!res.ok) throw new Error(`Failed to ${action} container`);
    return await res.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function fetchStacksData() {
  try {
    const res = await fetch(`${API_BASE_URL}/stacks`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch stacks");
    return await res.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function deployStack(name: string, file: File) {
  const formData = new FormData();
  formData.append('name', name);
  formData.append('file', file);
  
  const res = await fetch(`${API_BASE_URL}/stacks/deploy`, {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Deploy failed");
  }
  return await res.json();
}

export async function deleteStack(name: string) {
  const res = await fetch(`${API_BASE_URL}/stacks/${name}`, {
    method: 'DELETE',
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Delete failed");
  }
  return await res.json();
}

export async function fetchContainerLogs(id: string, tail: number = 100) {
  try {
    const res = await fetch(`${API_BASE_URL}/containers/${id}/logs?tail=${tail}`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch logs");
    return await res.json();
  } catch (error) {
    console.error(error);
    return { logs: "Error fetching logs." };
  }
}

export async function fetchImagesData() {
  try {
    const res = await fetch(`${API_BASE_URL}/images`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Failed to fetch images");
    return await res.json();
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function deleteImage(id: string) {
  const res = await fetch(`${API_BASE_URL}/images/${id}`, {
    method: 'DELETE',
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || "Delete failed");
  }
  return await res.json();
}
