// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";

const USERS = ["admin", "users"] as const;
const KEYS = ["me", "api-keys"] as const;

export function useUsers() {
	return useQuery({ queryKey: USERS, queryFn: () => api.listUsers() });
}

export function useCreateUser() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (u: { email: string; name?: string; password: string }) => api.createUser(u),
		onSuccess: () => qc.invalidateQueries({ queryKey: USERS }),
	});
}

export function useSetUserPassword() {
	return useMutation({ mutationFn: ({ id, password }: { id: string; password: string }) => api.setUserPassword(id, password) });
}

export function useDeleteUser() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteUser(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: USERS }),
	});
}

export function useApiKeys() {
	return useQuery({ queryKey: KEYS, queryFn: () => api.listApiKeys() });
}

export function useCreateApiKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (name: string) => api.createApiKey(name),
		onSuccess: () => qc.invalidateQueries({ queryKey: KEYS }),
	});
}

export function useDeleteApiKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.deleteApiKey(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: KEYS }),
	});
}
