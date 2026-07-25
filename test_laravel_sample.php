<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index()
    {
        $users = User::all();
        return $this->respond($users);
    }

    public function show($id)
    {
        $user = User::find($id);
        return $this->respond($user);
    }

    private function respond($data)
    {
        return response()->json($data);
    }
}
