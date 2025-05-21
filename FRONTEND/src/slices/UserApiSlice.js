import { USERS_URL } from "../Constants/constants.js";
import { apiSlice } from "./apiSlice";

export const usersApiSlice = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Login
    login: builder.mutation({
      query: (credentials) => ({
        url: `${USERS_URL}/login`,
        method: "POST",
        body: credentials,
      }),
    }),

    // Register
    register: builder.mutation({
      query: (credentials) => ({
        url: `${USERS_URL}/register`,
        method: "POST",
        body: credentials,
      }),
    }),

    // Logout
    logout: builder.mutation({
      query: () => ({
        url: `${USERS_URL}/logout`,
        method: "POST",
      }),
    }),

    // Get All Users (Admin only)
    getUsers: builder.query({
      query: () => ({
        url: `${USERS_URL}/`,
        method: "GET",
      }),
    }),

    // Get User by ID
    getUserById: builder.query({
      query: (id) => ({
        url: `${USERS_URL}/${id}`,
        method: "GET",
      }),
    }),

    // Promote User to Admin
    makeAdmin: builder.mutation({
      query: (id) => ({
        url: `${USERS_URL}/${id}`,
        method: "PUT",
      }),
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useGetUsersQuery,
  useGetUserByIdQuery,
  useMakeAdminMutation,
} = usersApiSlice;
