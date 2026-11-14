const trayRolled = new Set<string>();

export const markTrayRolled = (id: string) => trayRolled.add(id);
export const unmarkTrayRolled = (id: string) => trayRolled.delete(id);
export const wasTrayRolled = (id: string) => trayRolled.has(id);
